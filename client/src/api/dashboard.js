import api from './index'

export const getDashboardStats = () => api.get('/dashboard/stats').then(r => r.data)
export const getRecentCards = () => api.get('/dashboard/recent').then(r => r.data)
export const getChartData = () => api.get('/dashboard/chart-data').then(r => r.data)
export const getTopValueCards = () => api.get('/dashboard/top-value').then(r => r.data)
export const getRecentlySold = () => api.get('/dashboard/recently-sold').then(r => r.data)
