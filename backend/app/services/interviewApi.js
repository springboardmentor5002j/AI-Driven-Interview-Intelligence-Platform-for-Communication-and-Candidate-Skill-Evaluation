const API_BASE_URL = "http://127.0.0.1:8000";

export async function getInterviewResult(interviewId, token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/result`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.detail || "Failed to fetch interview result");
  }

  return response.json();
}