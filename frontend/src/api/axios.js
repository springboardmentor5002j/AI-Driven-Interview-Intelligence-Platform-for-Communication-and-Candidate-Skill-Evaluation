import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const api = axios.create({ baseURL, timeout: 120000 });
const refreshClient = axios.create({ baseURL, timeout: 15000 });
let refreshPromise = null;

api.interceptors.request.use((config) => {
  const url = config.url || "";
  const isPublicAuth = ["/auth/login/", "/auth/register/", "/auth/refresh/", "/auth/google/"].some((path) => url.includes(path));
  const token = localStorage.getItem("access_token");
  if (token && !isPublicAuth) config.headers.Authorization = `Bearer ${token}`;
  else if (config.headers?.Authorization) delete config.headers.Authorization;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = original?.url || "";
    const isAuthEndpoint = ["/auth/login/", "/auth/register/", "/auth/refresh/", "/auth/google/"].some((path) => url.includes(path));
    if (error.response?.status !== 401 || !original || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    const refresh = localStorage.getItem("refresh_token");
    if (!refresh) {
      localStorage.removeItem("access_token");
      window.location.assign("/login");
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      if (!refreshPromise) {
        refreshPromise = refreshClient.post("/auth/refresh/", { refresh })
          .then(({ data }) => {
            localStorage.setItem("access_token", data.access);
            if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
            return data.access;
          })
          .finally(() => { refreshPromise = null; });
      }
      const access = await refreshPromise;
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${access}`;
      return api(original);
    } catch (refreshError) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.assign("/login");
      return Promise.reject(refreshError);
    }
  }
);

export default api;
