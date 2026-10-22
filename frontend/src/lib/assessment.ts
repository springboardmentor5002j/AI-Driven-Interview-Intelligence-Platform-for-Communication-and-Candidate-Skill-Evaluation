export const skills = [
  "Java",
  "Python",
  "JavaScript",
  "React",
  "SQL",
  "Spring Boot",
  "Selenium",
  "REST Assured",
  "TestNG",
  "Git",
  "Docker",
  "PostgreSQL",
  "AWS",
  "TypeScript",
  "Microservices",
  "CI/CD",
];
export function assess(text: string, jd: string) {
  const t = text.toLowerCase();
  const target = skills.filter((s) =>
    jd.toLowerCase().includes(s.toLowerCase()),
  );
  const expected = target.length ? target : skills.slice(0, 10);
  const found = skills.filter((s) => t.includes(s.toLowerCase()));
  const missing = expected.filter((s) => !found.includes(s));
  const keyword = Math.round(
    ((expected.length - missing.length) / expected.length) * 100,
  );
  const sections = ["education", "experience", "skills", "projects"].filter(
    (s) => t.includes(s),
  );
  const structure = sections.length * 25;
  const impact = Math.min(
    100,
    30 +
      (text.match(/\d+%|\d+\s*(users|tests|apis|seconds|projects)/gi) || [])
        .length *
        15 +
      (text.match(/built|developed|implemented|improved|designed/gi) || [])
        .length *
        8,
  );
  return {
    score: Math.round(keyword * 0.5 + structure * 0.25 + impact * 0.25),
    keyword,
    structure,
    impact,
    found,
    missing,
    sections,
  };
}
export const questions = [
  {
    q: "Which collection stores unique elements in Java?",
    options: ["ArrayList", "HashSet", "LinkedList", "Queue"],
    answer: 1,
    explain: "A Set does not allow duplicate elements.",
  },
  {
    q: "Which HTTP status means a resource was created?",
    options: ["200", "201", "400", "500"],
    answer: 1,
    explain: "201 Created indicates successful resource creation.",
  },
  {
    q: "Which SQL clause filters groups after aggregation?",
    options: ["WHERE", "ORDER BY", "HAVING", "JOIN"],
    answer: 2,
    explain: "HAVING filters aggregated groups.",
  },
  {
    q: "What does dependency injection provide?",
    options: [
      "Manual object creation",
      "External provision of dependencies",
      "Database encryption",
      "Source compilation",
    ],
    answer: 1,
    explain: "Dependencies are supplied by a container or caller.",
  },
  {
    q: "What is the time complexity of binary search?",
    options: ["O(n)", "O(n²)", "O(log n)", "O(1)"],
    answer: 2,
    explain: "Binary search halves the search space each step.",
  },
];
export function interviewQuestions(
  domain: string,
  type: string,
  level: string,
  found: string[],
) {
  const tech = found[0] || domain;
  return type === "HR"
    ? [
        "Tell me about yourself and your career goals.",
        "Describe a challenge you faced and how you handled it.",
        "Why are you interested in this role?",
        "Tell me about a time you worked with a team.",
        "What would you like to improve in your next role?",
      ]
    : type === "Behavioral"
      ? [
          "Describe a situation where you resolved a disagreement.",
          "Tell me about a deadline you missed and what you learned.",
          "Share an example of taking initiative.",
          "How do you respond to critical feedback?",
          "Describe a difficult decision and its outcome.",
        ]
      : [
          `Describe your experience with ${tech} and a project where you used it.`,
          `Explain a core concept in ${domain} to a beginner.`,
          `How would you debug a slow ${domain} application?`,
          `Describe how you test and validate your implementation.`,
          `${level === "Advanced" ? "Design a scalable system" : "Describe a project architecture"} and explain your tradeoffs.`,
        ];
}
