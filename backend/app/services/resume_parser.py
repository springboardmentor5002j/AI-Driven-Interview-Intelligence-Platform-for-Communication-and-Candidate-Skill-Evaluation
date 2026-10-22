import re


SKILLS = [
    # Backend
    "Spring Boot",
    "FastAPI",
    "Flask",
    "REST API",
    "API",

    # Programming languages
    "Python",
    "Java",
    "C++",
    "JavaScript",
    "TypeScript",

    # Frontend
    "React",
    "React.js",
    "HTML",
    "CSS",

    # Databases
    "MySQL",
    "PostgreSQL",
    "MongoDB",
    "SQL",

    # AI / ML
    "Machine Learning",
    "Deep Learning",
    "Artificial Intelligence",
    "Computer Vision",
    "NLP",
    "TensorFlow",
    "PyTorch",
    "OpenCV",

    # DevOps / Cloud
    "Docker",
    "AWS",
    "Azure",
    "Git",
    "GitHub",

    # Data
    "Power BI",
    "DAX",
    "Pandas",
    "NumPy",
]


def extract_skills(text: str):
    found_skills = []

    for skill in SKILLS:
        pattern = r"(?<!\w)" + re.escape(skill) + r"(?!\w)"

        if re.search(pattern, text, re.IGNORECASE):
            found_skills.append(skill)

    return found_skills

def extract_section(text: str, section_names: list[str]):
    """
    Extract text from a section until the next major section heading.
    """

    lines = text.splitlines()

    start_index = None

    # Find the requested section
    for i, line in enumerate(lines):
        cleaned = line.strip().upper()

        if cleaned in [section.upper() for section in section_names]:
            start_index = i + 1
            break

    if start_index is None:
        return ""

    section_lines = []

    # Common resume section headings
    section_headings = {
        "EDUCATION",
        "ACADEMIC QUALIFICATIONS",
        "EDUCATIONAL QUALIFICATIONS",
        "EXPERIENCE",
        "WORK EXPERIENCE",
        "PROFESSIONAL EXPERIENCE",
        "EMPLOYMENT",
        "PROJECTS",
        "SKILLS",
        "TECHNICAL SKILLS",
        "CERTIFICATIONS",
        "ACHIEVEMENTS",
        "SUMMARY",
        "EXECUTIVE SUMMARY",
        "OBJECTIVE",
        "INTERNSHIPS",
        "PUBLICATIONS",
        "LANGUAGES",
    }

    for line in lines[start_index:]:
        cleaned = line.strip().upper()

        if cleaned in section_headings:
            break

        if line.strip():
            section_lines.append(line.strip())

    return "\n".join(section_lines)


def extract_education(text: str):
    education_sections = [
        "EDUCATION",
        "ACADEMIC QUALIFICATIONS",
        "EDUCATIONAL QUALIFICATIONS"
    ]

    return extract_section(text, education_sections)


def extract_experience(text: str):
    experience_sections = [
        "EXPERIENCE",
        "WORK EXPERIENCE",
        "PROFESSIONAL EXPERIENCE",
        "EMPLOYMENT"
    ]

    return extract_section(text, experience_sections)


def generate_resume_summary(
    skills: list[str],
    education: str,
    experience: str
):
    summary_parts = []

    if skills:
        skill_text = ", ".join(skills[:8])
        summary_parts.append(
            f"Candidate with skills in {skill_text}."
        )

    if education:
        education_lines = [
            line.strip()
            for line in education.splitlines()
            if line.strip()
        ]

        if education_lines:
            education_text = " ".join(education_lines[:2])
            summary_parts.append(
                f"Educational background includes {education_text}."
            )

    if experience:
        experience_lines = [
            line.strip()
            for line in experience.splitlines()
            if line.strip()
        ]

        if experience_lines:
            experience_text = " ".join(experience_lines[:3])

            # Remove repeated punctuation
            experience_text = experience_text.rstrip(". ")

            summary_parts.append(
                f"Professional experience includes {experience_text}."
            )

    if not summary_parts:
        return "No resume information available."

    return " ".join(summary_parts)


def normalize_skills(skills: list[str]):
    normalized = []

    # More specific skills should be retained
    aliases = {
        "React.js": "React",
        "REST API": "REST API",
    }

    for skill in skills:
        skill = aliases.get(skill, skill)

        if skill not in normalized:
            normalized.append(skill)

    # Remove generic API when REST API already exists
    if "REST API" in normalized and "API" in normalized:
        normalized.remove("API")

    return normalized