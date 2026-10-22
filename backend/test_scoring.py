# from app.services.scoring_service import get_score_rating

from app.services.scoring_service import (
    calculate_communication_score,
    calculate_confidence_score,
    calculate_technical_score,
    calculate_professionalism_score,
    calculate_overall_score,
    generate_feedback
)


question = "Explain how you used Python in your project."

answer = (
    "I used Python in my project to develop the backend API. "
    "I worked with Python for data processing and implemented "
    "the solution with my team. I also tested and improved "
    "the project during development."
)


communication = calculate_communication_score(answer)

confidence = calculate_confidence_score(answer)

technical = calculate_technical_score(
    question,
    answer
)

professionalism = calculate_professionalism_score(answer)

overall = calculate_overall_score(
    communication,
    confidence,
    technical,
    professionalism
)

feedback = generate_feedback(
    communication,
    confidence,
    technical,
    professionalism
)


print("Communication:", communication)
print("Confidence:", confidence)
print("Technical:", technical)
print("Professionalism:", professionalism)
print("Overall:", overall)
print("Feedback:", feedback)


# print(get_score_rating(61.92))
# print(get_score_rating(85))
# print(get_score_rating(95))