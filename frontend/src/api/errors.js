// Turns any API error into a short, readable sentence for the user.
export function describeError(err, fallback) {
  // Server not running / wrong address / CORS blocked
  if (!err.response) {
    return "Cannot reach the backend. Make sure 'python manage.py runserver' is running on port 8000.";
  }
  const { status, data } = err.response;
  if (status >= 500) {
    return "The server crashed (status " + status + "). Look at the backend terminal for the error. " +
           "Most common cause: run 'python manage.py migrate'.";
  }
  if (status === 401) {
    return data?.detail || "Wrong username or password.";
  }
  if (data && typeof data === "object") {
    const parts = Object.entries(data).map(([field, msgs]) =>
      field === "detail" ? String(msgs) : `${field}: ${[].concat(msgs).join(" ")}`
    );
    if (parts.length) return parts.join(" | ");
  }
  return fallback;
}
