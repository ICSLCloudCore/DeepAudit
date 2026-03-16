import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// API base URL - points to /api/v1 on the backend
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL,
  // 不要设置默认的Content-Type，让axios根据数据类型自动处理
  // 确保重定向时保留Authorization header
  maxRedirects: 5,
});

// Request interceptor to add token and handle Content-Type
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Check both localStorage (remember me) and sessionStorage (session only)
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // 处理Content-Type
    if (config.data instanceof FormData) {
      // 对于FormData，删除Content-Type让浏览器自动设置（包含boundary）
      delete config.headers['Content-Type'];
    } else if (config.data instanceof URLSearchParams) {
      // 对于URLSearchParams，确保有正确的Content-Type
      // 如果调用方没有设置，才设置默认的
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    } else if (config.data && typeof config.data === 'object') {
      // 对于普通对象，设置为JSON
      // 如果调用方没有设置，才设置默认的
      if (!config.headers['Content-Type']) {
        config.headers['Content-Type'] = 'application/json';
      }
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Auto logout if token is invalid or expired
      localStorage.removeItem('access_token');
      sessionStorage.removeItem('access_token');
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
