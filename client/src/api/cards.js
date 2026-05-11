import api from './index'

export const getCards = (params) => api.get('/cards', { params }).then(r => r.data)
export const getCard = (id) => api.get(`/cards/${id}`).then(r => r.data)
export const createCard = (data) => api.post('/cards', data).then(r => r.data)
export const updateCard = (id, data) => api.put(`/cards/${id}`, data).then(r => r.data)
export const deleteCard = (id) => api.delete(`/cards/${id}`).then(r => r.data)
export const getCardStats = () => api.get('/cards/stats').then(r => r.data)

export const uploadImages = (cardId, formData) =>
  api.post(`/images/upload/${cardId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)

export const getImages = (cardId) => api.get(`/images/${cardId}`).then(r => r.data)
export const deleteImage = (imageId) => api.delete(`/images/${imageId}`).then(r => r.data)
export const setPrimaryImage = (imageId) => api.put(`/images/${imageId}/primary`).then(r => r.data)
export const setImageSide = (imageId, side) => api.put(`/images/${imageId}/side`, { side }).then(r => r.data)
