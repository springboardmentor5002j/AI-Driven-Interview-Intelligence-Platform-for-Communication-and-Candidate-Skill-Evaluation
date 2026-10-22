def calculate_communication_score(answer: str) -> float:
    """
    Basic communication score based on answer length
    and sentence structure.
    """

    if not answer or not answer.strip():
        return 0.0

    words = answer.split()
    word_count = len(words)

    if word_count >= 50:
        return 90.0
    elif word_count >= 30:
        return 80.0
    elif word_count >= 15:
        return 70.0
    elif word_count >= 8:
        return 60.0
    else:
        return 40.0


def calculate_confidence_score(answer: str) -> float:
    """
    Initial rule-based confidence estimate.

    This will later be replaced/enhanced using
    speech, video and behavioral analysis.
    """

    if not answer or not answer.strip():
        return 0.0

    words = answer.split()
    word_count = len(words)

    if word_count >= 40:
        return 85.0
    elif word_count >= 25:
        return 75.0
    elif word_count >= 15:
        return 65.0
    elif word_count >= 8:
        return 55.0
    else:
        return 40.0


def calculate_technical_score(
    question: str,
    answer: str
) -> float:
    """
    Basic technical relevance score.

    Checks whether important words from the question
    appear in the answer.
    """

    if not answer or not answer.strip():
        return 0.0

    question_words = {
        word.lower().strip(".,?!")
        for word in question.split()
        if len(word) > 3
    }

    answer_words = {
        word.lower().strip(".,?!")
        for word in answer.split()
    }

    if not question_words:
        return 50.0

    matched_words = question_words.intersection(answer_words)

    relevance = len(matched_words) / len(question_words)

    score = relevance * 100

    return round(min(score, 100.0), 2)


def calculate_professionalism_score(answer: str) -> float:
    """
    Basic professionalism score.
    """

    if not answer or not answer.strip():
        return 0.0

    professional_words = [
        "project",
        "team",
        "experience",
        "learn",
        "develop",
        "improve",
        "responsibility",
        "solution",
        "skills",
        "contribute"
    ]

    answer_lower = answer.lower()

    matches = sum(
        1
        for word in professional_words
        if word in answer_lower
    )

    if matches >= 4:
        return 90.0
    elif matches >= 3:
        return 80.0
    elif matches >= 2:
        return 70.0
    elif matches >= 1:
        return 60.0
    else:
        return 50.0


def calculate_overall_score(
    communication: float,
    confidence: float,
    technical: float,
    professionalism: float
) -> float:

    overall = (
        communication * 0.30
        + confidence * 0.25
        + technical * 0.30
        + professionalism * 0.15
    )

    return round(overall, 2)


def generate_feedback(
    communication: float,
    confidence: float,
    technical: float,
    professionalism: float
) -> str:

    feedback = []

    if communication < 70:
        feedback.append(
            "Improve communication by giving clearer and more detailed answers."
        )

    if confidence < 70:
        feedback.append(
            "Work on giving answers more confidently and with greater clarity."
        )

    if technical < 70:
        feedback.append(
            "Provide more technically relevant details in your answers."
        )

    if professionalism < 70:
        feedback.append(
            "Use more professional examples and explain your project experience."
        )

    if not feedback:
        feedback.append(
            "Good overall performance. Continue improving clarity, "
            "technical depth, and confidence."
        )

    return " ".join(feedback)

def get_score_rating(score: float) -> str:
    if score >= 90:
        return "Excellent"
    elif score >= 75:
        return "Good"
    elif score >= 60:
        return "Average"
    elif score >= 40:
        return "Needs Improvement"
    else:
        return "Poor"