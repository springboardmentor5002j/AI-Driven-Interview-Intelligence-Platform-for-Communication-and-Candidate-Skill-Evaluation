const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function readResponse(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || fallback);
  }
  return data;
}

export async function getMyResumes(token) {
  const response = await fetch(`${API_BASE_URL}/resume`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readResponse(response, "Could not load resumes");
}

export async function uploadResume(file, token) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE_URL}/resume/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return readResponse(response, "Could not upload resume");
}
