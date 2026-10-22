import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pypdf import PdfReader
from pypdf.errors import PdfReadError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.services.resume_parser import (
    extract_education,
    extract_experience,
    extract_skills,
    generate_resume_summary,
    normalize_skills,
)

router = APIRouter(prefix="/resume", tags=["Resume"])
UPLOAD_DIR = Path("uploads/resumes")
MAX_RESUME_BYTES = 10 * 1024 * 1024


def _resume_response(resume: Resume):
    return {
        "resume_id": resume.id,
        "filename": resume.original_filename,
        "uploaded_at": resume.uploaded_at,
        "text_length": len(resume.extracted_text or ""),
        "skills": [item.strip() for item in (resume.skills or "").split(",") if item.strip()],
        "education": resume.education or "",
        "experience": resume.experience or "",
        "summary": resume.summary or "",
    }


@router.get("")
def list_resumes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    resumes = (
        db.query(Resume)
        .filter(Resume.user_id == current_user.id)
        .order_by(Resume.uploaded_at.desc(), Resume.id.desc())
        .all()
    )
    return [_resume_response(resume) for resume in resumes]


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "").name
    if not filename or Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Choose a PDF file")

    if file.content_type not in {"application/pdf", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read(MAX_RESUME_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="The selected PDF is empty")
    if len(content) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=413, detail="PDF files must be 10 MB or smaller")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid PDF")

    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).stem).strip("._") or "resume"
    stored_name = f"{uuid.uuid4()}_{safe_stem}.pdf"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = UPLOAD_DIR / stored_name

    try:
        file_path.write_bytes(content)
        reader = PdfReader(str(file_path), strict=True)
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Password-protected PDFs are not supported")
        extracted_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        if not extracted_text:
            raise HTTPException(status_code=400, detail="No selectable text was found in this PDF")

        skills = normalize_skills(extract_skills(extracted_text))
        education = extract_education(extracted_text)
        experience = extract_experience(extracted_text)
        summary = generate_resume_summary(skills, education, experience)

        resume = Resume(
            user_id=current_user.id,
            original_filename=filename[:255],
            stored_filename=stored_name,
            file_path=str(file_path),
            extracted_text=extracted_text,
            skills=", ".join(skills),
            education=education,
            experience=experience,
            summary=summary,
        )
        db.add(resume)
        db.commit()
        db.refresh(resume)
        return {
            "message": "Resume uploaded and processed successfully",
            **_resume_response(resume),
        }
    except HTTPException:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    except (PdfReadError, ValueError):
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded PDF could not be read") from None
    except Exception:
        db.rollback()
        file_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
