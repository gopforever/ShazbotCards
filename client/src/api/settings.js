import api from './index'

export const getSettings = () => api.get('/settings').then(r => r.data)
export const saveSettings = (data) => api.post('/settings', data).then(r => r.data)
