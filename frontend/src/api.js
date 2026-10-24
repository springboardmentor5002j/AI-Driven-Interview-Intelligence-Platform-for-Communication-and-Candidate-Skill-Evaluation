const BASE_URL = 'http://127.0.0.1:8000/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `Request failed (status ${res.status})`)
  return data
}

export function loginUser(email, password) {
  return request('/auth/login/', { method: 'POST', body: JSON.stringify({ username: email, email, password }) })
}

export function signupUser(name, email, password, role) {
  return request('/auth/signup/', { method: 'POST', body: JSON.stringify({ username: email, email, password, full_name: name, role }) })
}

export function getMe() {
  return request('/auth/me/')
}

export function uploadResume(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request('/auth/resume/upload/', { method: 'POST', body: formData })
}

export function generateInterview(resumeId, difficulty, roundType) {
  return request('/auth/interview/generate/', {
    method: 'POST',
    body: JSON.stringify({ resume: resumeId, difficulty, round_type: roundType }),
  })
}

export function getNextQuestion(previousQuestion, candidateAnswer, skills, difficulty, roundType) {
  return request('/auth/interview/next-question/', {
    method: 'POST',
    body: JSON.stringify({
      previous_question: previousQuestion,
      candidate_answer: candidateAnswer,
      skills,
      difficulty,
      round_type: roundType,
    }),
  })
}

export function getInterviewFeedback(history, skills, difficulty, confidenceScores, roundType) {
  return request('/auth/interview/feedback/', {
    method: 'POST',
    body: JSON.stringify({
      history,
      skills,
      difficulty,
      confidence_scores: confidenceScores,
      round_type: roundType,
    }),
  })
}

export function transcribeAnswer(audioBlob) {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'answer.webm')
  return request('/auth/interview/transcribe/', { method: 'POST', body: formData })
}

export async function fetchSpeech(text) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE_URL}/auth/interview/speak/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.detail || `Voice generation failed (status ${res.status})`)
  }
  return res.blob()
}

export function getCandidateReports() {
  return request('/auth/reports/')
}

export function getMyHistory() {
  return request('/auth/history/')
}

export function getAdminUsers() {
  return request('/auth/admin/users/')
}

export function getAdminStats() {
  return request('/auth/admin/stats/')
}

export function updateUserRole(userId, data) {
  return request(`/auth/admin/users/${userId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}