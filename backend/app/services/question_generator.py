def generate_technical_questions(
    skills: list[str],
    difficulty: str = "Medium",
    questions_per_skill: int = 2
):
    questions = []

    templates = {
        "Easy": [
            "What is {skill}, and what is it commonly used for?",
            "What are the main features of {skill}?"
        ],
        "Medium": [
            "Explain how you have used {skill} in a project.",
            "What are some common challenges when working with {skill}?"
        ],
        "Hard": [
            "How would you design a production-ready system using {skill}?",
            "What performance or scalability issues can arise when using {skill}, and how would you address them?"
        ]
    }

    selected_templates = templates.get(
        difficulty,
        templates["Medium"]
    )

    for skill in skills:
        for template in selected_templates[:questions_per_skill]:
            questions.append(
                template.format(skill=skill)
            )

    return questions


def generate_resume_based_questions(
    skills: list[str],
    experience: str,
    difficulty: str = "Medium"
):
    questions = []

    # Skill-based questions
    questions.extend(
        generate_technical_questions(
            skills[:5],
            difficulty=difficulty,
            questions_per_skill=1
        )
    )

    # Experience-based questions
    if experience:
        experience_lines = [
            line.strip()
            for line in experience.splitlines()
            if line.strip()
        ]

        # Use meaningful resume lines as interview context
        for line in experience_lines[:5]:
            if line.startswith("•"):
                line = line.lstrip("•").strip()

            questions.append(
                f"Your resume mentions: '{line}'. "
                f"Can you explain your approach and the technical decisions you made?"
            )

    return questions


def generate_hr_questions():
    return [
        "Tell me about yourself.",
        "Why are you interested in this role?",
        "What are your strengths?",
        "What is one area you are currently working to improve?",
        "Why should we consider you for this position?",
        "Where do you see yourself in the next five years?"
    ]


def generate_behavioral_questions():
    return [
        "Tell me about a challenging project you worked on and how you handled it.",
        "Describe a time when you had to solve a difficult technical problem.",
        "Tell me about a time when you worked as part of a team.",
        "Describe a situation where you had to learn a new technology quickly.",
        "Tell me about a mistake you made in a project and what you learned from it.",
        "Describe a situation where you had to work under a tight deadline."
    ]


def generate_aptitude_questions():
    return [
        "If a problem requires O(n²) time and the input size doubles, how does the approximate number of operations change?",
        "What is the probability of getting a head when a fair coin is tossed once?",
        "If a train travels 60 km in 1 hour, what is its average speed in meters per second?",
        "What is the next number in the sequence: 2, 4, 8, 16, ?",
        "If 5 workers complete a task in 10 days, assuming equal productivity, how many days would 10 workers require?"
    ]