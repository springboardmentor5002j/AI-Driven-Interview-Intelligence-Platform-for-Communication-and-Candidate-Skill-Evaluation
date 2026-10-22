import re

SKILLS = ['Java', 'Python', 'JavaScript', 'React', 'SQL', 'Spring Boot', 'Selenium', 'REST Assured', 'TestNG', 'Git', 'Docker', 'PostgreSQL', 'AWS', 'TypeScript', 'Microservices', 'CI/CD']
QUESTIONS = [
    {'q': 'Which collection stores unique elements in Java?', 'options': ['ArrayList', 'HashSet', 'LinkedList', 'Queue'], 'answer': 1, 'explain': 'A Set does not allow duplicate elements.'},
    {'q': 'Which HTTP status means a resource was created?', 'options': ['200', '201', '400', '500'], 'answer': 1, 'explain': '201 Created indicates successful resource creation.'},
    {'q': 'Which SQL clause filters groups after aggregation?', 'options': ['WHERE', 'ORDER BY', 'HAVING', 'JOIN'], 'answer': 2, 'explain': 'HAVING filters aggregated groups.'},
    {'q': 'What does dependency injection provide?', 'options': ['Manual object creation', 'External provision of dependencies', 'Database encryption', 'Source compilation'], 'answer': 1, 'explain': 'Dependencies are supplied by a container or caller.'},
    {'q': 'What is the time complexity of binary search?', 'options': ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'], 'answer': 2, 'explain': 'Binary search halves the search space each step.'},
]


def rounded(n):
    return int(n + .5)


def assess(text, jd):
    t = text.lower()
    expected = [s for s in SKILLS if s.lower() in jd.lower()] or SKILLS[:10]
    found = [s for s in SKILLS if s.lower() in t]
    missing = [s for s in expected if s not in found]
    keyword = rounded((len(expected) - len(missing)) / len(expected) * 100)
    sections = [s for s in ['education', 'experience', 'skills', 'projects'] if s in t]
    structure = len(sections) * 25
    impact = min(100, 30 + len(re.findall(r'\d+%|\d+\s*(?:users|tests|apis|seconds|projects)', text, re.I)) * 15 + len(re.findall(r'built|developed|implemented|improved|designed', text, re.I)) * 8)
    return {'score': rounded(keyword * .5 + structure * .25 + impact * .25), 'keyword': keyword,
            'structure': structure, 'impact': impact, 'found': found, 'missing': missing, 'sections': sections}


def score_test(answers):
    return {'score': sum(a == q['answer'] for a, q in zip(answers, QUESTIONS)) * 20,
            'review': [{'question': q['q'], 'correct': answers[i] == q['answer'], 'answer': q['options'][q['answer']], 'explanation': q['explain']} for i, q in enumerate(QUESTIONS)]}
