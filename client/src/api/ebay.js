import api from './index'

export const getEbayAuthUrl = () => api.get('/ebay/auth-url').then(r => r.data)
export const getEbayStatus = () => api.get('/ebay/status').then(r => r.data)
export const listOnEbay = (cardId, data) => api.post(`/ebay/list/${cardId}`, data).then(r => r.data)
export const getEbayListings = () => api.get('/ebay/listings').then(r => r.data)
export const endEbayListing = (itemId) => api.delete(`/ebay/listings/${itemId}`).then(r => r.data)
export const getEbaySold = () => api.get('/ebay/sold').then(r => r.data)
