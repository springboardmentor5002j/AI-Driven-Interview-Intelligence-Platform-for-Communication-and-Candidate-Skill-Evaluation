from app.database.database import SessionLocal
from app.models.resume import Resume
from app.services.resume_parser import (
    extract_skills,
    extract_education,
    extract_experience
)


db = SessionLocal()

try:
    resume = (
        db.query(Resume)
        .order_by(Resume.id.desc())
        .first()
    )

    if not resume:
        print("No resume found.")
    else:
        print("=" * 60)
        print("RESUME:", resume.original_filename)
        print("=" * 60)

        print("\nSKILLS:")
        print(extract_skills(resume.extracted_text))

        print("\nEDUCATION:")
        print(extract_education(resume.extracted_text))

        print("\nEXPERIENCE:")
        print(extract_experience(resume.extracted_text))

finally:
    db.close()