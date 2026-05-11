import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getEbayListings, endEbayListing, getEbaySold, getEbayStatus, getEbayAuthUrl } from '../api/ebay'
import { fmt, fmtDate } from '../components/badges'
import { ArrowPathIcon, LinkIcon } from '@heroicons/react/24/outline'

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

export default function EbayListings() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('active')

  const { data: status } = useQuery({ queryKey: ['ebay-status'], queryFn: getEbayStatus })
  const { data: activeListings, isLoading: activeLoading, refetch: refetchActive } = useQuery({
    queryKey: ['ebay-listings'],
    queryFn: getEbayListings,
    enabled: tab === 'active'
  })
  const { data: soldItems, isLoading: soldLoading, refetch: refetchSold } = useQuery({
    queryKey: ['ebay-sold'],
    queryFn: getEbaySold,
    enabled: tab === 'sold'
  })

  const endMutation = useMutation({
    mutationFn: endEbayListing,
    onSuccess: () => { toast.success('Listing ended'); qc.invalidateQueries(['ebay-listings']) },
    onError: err => toast.error(err.message)
  })

  const handleConnect = async () => {
    try {
      const { url } = await getEbayAuthUrl()
      window.location.href = url
    } catch (err) {
      toast.error(err.message)
    }
  }

  const offers = activeListings?.offers || []
  const orders = soldItems?.orders || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">eBay Listings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Manage your eBay inventory</p>
        </div>
        <div className="flex items-center gap-3">
          {/* eBay auth status */}
          {status?.connected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <span className="w-2 h-2 bg-emerald-400 rounded-full" />
              <span className="text-emerald-400 text-sm">eBay Connected</span>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
            >
              <LinkIcon className="w-4 h-4" />
              Connect eBay
            </button>
          )}
          <button
            onClick={() => { refetchActive(); refetchSold() }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Sync
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <Tab active={tab === 'active'} onClick={() => setTab('active')}>Active Listings</Tab>
        <Tab active={tab === 'sold'} onClick={() => setTab('sold')}>Sold Orders</Tab>
      </div>

      {/* Active listings tab */}
      {tab === 'active' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          {activeLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : offers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Format</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {offers.map((offer, i) => (
                    <tr key={offer.offerId || i} className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-white">{offer.sku}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          offer.status === 'PUBLISHED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-600 text-slate-300'
                        }`}>{offer.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-emerald-400">
                        {offer.pricingSummary?.price ? `$${offer.pricingSummary.price.value}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{offer.format}</td>
                      <td className="px-4 py-3 text-right">
                        {offer.listing?.listingId && (
                          <a
                            href={`https://www.ebay.com/itm/${offer.listing.listingId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 mr-3"
                          >
                            View
                          </a>
                        )}
                        <button
                          onClick={() => endMutation.mutate(offer.offerId)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          End Listing
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <p className="text-slate-400">No active listings found</p>
              <p className="text-slate-500 text-sm mt-1">List cards from the Inventory page</p>
            </div>
          )}
        </div>
      )}

      {/* Sold orders tab */}
      {tab === 'sold' && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          {soldLoading ? (
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Order ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {orders.map((order, i) => (
                    <tr key={order.orderId || i} className="hover:bg-slate-700/50 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-mono">{order.orderId}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{order.orderFulfillmentStatus}</td>
                      <td className="px-4 py-3 text-sm text-emerald-400">
                        {order.pricingSummary?.total ? `$${order.pricingSummary.total.value}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">{fmtDate(order.creationDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center">
              <p className="text-slate-400">No orders found</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
