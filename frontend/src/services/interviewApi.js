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
    throw new Error(
      errorData.detail || "Failed to fetch interview result"
    );
  }

  return response.json();
}


export async function getMyInterviews(token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/my-interviews`,
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
    throw new Error(
      errorData.detail || "Failed to fetch interviews"
    );
  }

  return response.json();
}

export async function getInterviewQuestions(interviewId, token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/questions`,
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

    throw new Error(
      errorData.detail || "Failed to fetch interview questions"
    );
  }

  return response.json();
}

export async function startInterview(interviewId, token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/start`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.detail || "Failed to start interview"
    );
  }

  return response.json();
}

export async function submitAnswer(
  interviewId,
  questionId,
  answerText,
  token
) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/questions/${questionId}/answer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answer_text: answerText,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.detail || "Failed to submit answer"
    );
  }

  return response.json();
}

export async function uploadAnswerAudio(interviewId, questionId, blob, durationSeconds, token) {
  const body = new FormData();
  const type = blob.type || "audio/webm";
  const extension = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "mp4" : "webm";
  body.append("audio", blob, `answer.${extension}`);
  body.append("duration_seconds", String(durationSeconds));

  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/questions/${questionId}/audio`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to upload and transcribe audio answer");
  return data;
}

export async function completeInterview(interviewId, token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.detail || "Failed to complete interview"
    );
  }

  return response.json();
}

export async function evaluateInterview(interviewId, token) {
  const response = await fetch(
    `${API_BASE_URL}/interviews/${interviewId}/evaluate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json();

    throw new Error(
      errorData.detail || "Failed to evaluate interview"
    );
  }

  return response.json();
}

export async function generateInterview(
  resumeId,
  interviewType,
  difficulty,
  token
) {
  const params = new URLSearchParams({
    resume_id: String(resumeId),
    interview_type: interviewType,
    difficulty: difficulty,
  });

  const response = await fetch(
    `${API_BASE_URL}/interviews/generate?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    let errorMessage = "Failed to generate interview";

    if (typeof data.detail === "string") {
      errorMessage = data.detail;
    } else if (Array.isArray(data.detail)) {
      errorMessage = data.detail
        .map((error) => {
          const field = error.loc
            ? error.loc.join(" → ")
            : "unknown field";

          return `${field}: ${error.msg}`;
        })
        .join(", ");
    } else if (data.detail) {
      errorMessage = JSON.stringify(data.detail);
    } else if (data.message) {
      errorMessage = data.message;
    }

    throw new Error(errorMessage);
  }

  return data;
}
