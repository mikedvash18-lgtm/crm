import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        const { data } = await axios.post('/api/auth/refresh', { refresh_token: refresh });
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        original.headers.Authorization = `Bearer ${data.data.access_token}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  refresh: (token) => api.post('/auth/refresh', { refresh_token: token }),
  me: () => api.get('/auth/me'),
};

// Campaigns
export const campaignApi = {
  list: (params) => api.get('/campaigns', { params }),
  get: (id) => api.get(`/campaigns/${id}`),
  create: (data) => api.post('/campaigns', data),
  update: (id, data) => api.put(`/campaigns/${id}`, data),
  start: (id) => api.post(`/campaigns/${id}/start`),
  pause: (id) => api.post(`/campaigns/${id}/pause`),
  resume: (id) => api.post(`/campaigns/${id}/resume`),
};

// Leads
export const leadApi = {
  list: (params) => api.get('/leads', { params }),
  get: (id) => api.get(`/leads/${id}`),
  upload: (formData) => api.post('/leads/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  updateStatus: (id, status) => api.put(`/leads/${id}/status`, { status }),
  retry: (id) => api.post(`/leads/${id}/retry`),
};

// Stats
export const statsApi = {
  dashboard: () => api.get('/stats/dashboard'),
  campaign: (id, params) => api.get(`/stats/campaign/${id}`, { params }),
  broker: (id, params) => api.get(`/stats/broker/${id}`, { params }),
};

// Transfers
export const transferApi = {
  initiate: (data) => api.post('/transfers', data),
  pending: () => api.get('/transfers/pending'),
  accept: (id) => api.post(`/transfers/${id}/accept`),
  reject: (id) => api.post(`/transfers/${id}/reject`),
  complete: (id, data) => api.post(`/transfers/${id}/complete`, data),
};

export default api;
