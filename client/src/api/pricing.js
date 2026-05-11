import api from './index'

export const searchPricingCards = (query, game) =>
  api.get('/pricing/search', { params: { q: query, ...(game ? { game } : {}) } }).then(r => r.data)
export const getPricingProduct = (productId) => api.get(`/pricing/product/${productId}`).then(r => r.data)
export const getTCGPrice = (productId) => api.get(`/pricing/tcg/${productId}`).then(r => r.data)
export const getSportsPrice = (cardsId) => api.get(`/pricing/sports/${cardsId}`).then(r => r.data)
export const getEbaySold = (query) => api.get(`/pricing/ebay-sold/${encodeURIComponent(query)}`).then(r => r.data)
export const updateCardPrice = (cardId) => api.post(`/pricing/update/${cardId}`).then(r => r.data)
