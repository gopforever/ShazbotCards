import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.response.use(
  res => res,
  err => {
    const message = err.response?.data?.error || err.message || 'An error occurred'
    return Promise.reject(new Error(message))
  }
)

export default api
