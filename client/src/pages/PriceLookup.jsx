import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getEbaySold as getEbaySoldComps, getPricingProduct, searchPricingCards } from '../api/pricing'
import { fmt, fmtDate } from '../components/badges'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const GAME_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Baseball', value: 'baseball' },
  { label: 'Basketball', value: 'basketball' },
  { label: 'Football', value: 'football' },
  { label: 'Hockey', value: 'hockey' },
  { label: 'Pokémon', value: 'pokemon' },
  { label: 'MTG', value: 'mtg' }
]

function pickPrice(data, keys) {
  return keys.map(key => data?.[key]).find(val => val !== undefined && val !== null)
}

export default function PriceLookup() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [game, setGame] = useState('')
  const [selectedProductId, setSelectedProductId] = useState(null)

  const { data: searchData, isLoading: isSearching, error: searchError } = useQuery({
    queryKey: ['pricing-search', submitted, game],
    queryFn: () => searchPricingCards(submitted, game || null),
    enabled: !!submitted
  })

  const { data: productDetail, isLoading: isLoadingProduct, error: productError } = useQuery({
    queryKey: ['pricing-product', selectedProductId],
    queryFn: () => getPricingProduct(selectedProductId),
    enabled: !!selectedProductId
  })

  const { data: soldComps, isLoading: isLoadingEbay, error: ebayError } = useQuery({
    queryKey: ['ebay-sold-comps', submitted],
    queryFn: () => getEbaySoldComps(submitted),
    enabled: !!submitted
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSubmitted(query.trim())
    setSelectedProductId(null)
  }

  const results = searchData?.results || []
  const market = pickPrice(productDetail, ['market_price', 'marketPrice', 'price']) ?? pickPrice(productDetail?.prices, ['market'])
  const low = pickPrice(productDetail, ['low']) ?? pickPrice(productDetail?.prices, ['low'])
  const mid = pickPrice(productDetail, ['mid']) ?? pickPrice(productDetail?.prices, ['mid'])
  const high = pickPrice(productDetail, ['high']) ?? pickPrice(productDetail?.prices, ['high'])

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Price Lookup</h1>
        <p className="text-slate-400 text-sm mt-0.5">Search SportscardsPro cards and compare with recent eBay sold listings</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search e.g. 2023 Topps Mike Trout PSA 10"
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-3 pl-10 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          />
        </div>
        <select
          value={game}
          onChange={e => setGame(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-3 focus:outline-none focus:border-indigo-500"
        >
          {GAME_OPTIONS.map(opt => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
        </select>
        <button
          type="submit"
          disabled={!query.trim() || isSearching || isLoadingEbay}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* SportscardsPro errors */}
      {(searchError || productError) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">{searchError?.message || productError?.message}</p>
          <p className="text-slate-500 text-xs mt-1">Make sure your SportscardsPro API key is configured in Settings</p>
        </div>
      )}

      {submitted && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              SportscardsPro Results
              <span className="text-slate-400 font-normal text-base ml-2">"{submitted}"</span>
            </h2>
            <span className="text-slate-400 text-sm">{results.length} results</span>
          </div>

          {results.length === 0 && !isSearching ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-400">No matching products found</p>
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-900/50 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Card</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Set / Year</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Market</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Low / Mid / High</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {results.map((item, i) => {
                    const id = item.id || item.product_id || item.productId
                    const marketPrice = pickPrice(item, ['market_price', 'marketPrice', 'price']) ?? pickPrice(item?.prices, ['market'])
                    const itemLow = pickPrice(item, ['low']) ?? pickPrice(item?.prices, ['low'])
                    const itemMid = pickPrice(item, ['mid']) ?? pickPrice(item?.prices, ['mid'])
                    const itemHigh = pickPrice(item, ['high']) ?? pickPrice(item?.prices, ['high'])
                    return (
                      <tr key={id || i} className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-white">{item.name || item.title || 'Unnamed product'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{[item.set, item.year].filter(Boolean).join(' • ') || '-'}</td>
                        <td className="px-4 py-3 text-sm text-emerald-400 font-semibold">{marketPrice != null ? fmt(marketPrice) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {itemLow != null || itemMid != null || itemHigh != null
                            ? `${itemLow != null ? fmt(itemLow) : '-'} / ${itemMid != null ? fmt(itemMid) : '-'} / ${itemHigh != null ? fmt(itemHigh) : '-'}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={!id || isLoadingProduct}
                            onClick={() => setSelectedProductId(id)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium rounded"
                          >
                            View Pricing
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {productDetail && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-white font-semibold">Selected Product Pricing</h3>
                <p className="text-slate-400 text-sm mt-1">{productDetail.name || productDetail.title || `Product #${selectedProductId}`}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Market Price', value: market },
                  { label: 'Low', value: low },
                  { label: 'Mid', value: mid },
                  { label: 'High', value: high }
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-900/50 border border-slate-700 rounded-lg p-3">
                    <p className="text-slate-400 text-xs">{label}</p>
                    <p className="text-emerald-400 text-lg font-bold mt-1">{value != null ? fmt(value) : '-'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* eBay errors */}
      {ebayError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">{ebayError.message}</p>
          <p className="text-slate-500 text-xs mt-1">Make sure your eBay App ID is configured in Settings</p>
        </div>
      )}

      {soldComps && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              eBay Sold Listings
              <span className="text-slate-400 font-normal text-base ml-2">"{submitted}"</span>
            </h2>
            <span className="text-slate-400 text-sm">{soldComps.length} results</span>
          </div>

          {soldComps.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center">
              <p className="text-slate-400">No recent sold listings found</p>
            </div>
          ) : (
            <>
              {/* Summary stats */}
              {soldComps.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Avg Sold Price', value: fmt(soldComps.reduce((s, i) => s + i.price, 0) / soldComps.length) },
                    { label: 'Highest Sale', value: fmt(Math.max(...soldComps.map(i => i.price))) },
                    { label: 'Lowest Sale', value: fmt(Math.min(...soldComps.map(i => i.price))) }
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                      <p className="text-slate-400 text-xs mb-1">{label}</p>
                      <p className="text-emerald-400 font-bold text-xl">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Sold items table */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-900/50 border-b border-slate-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Sold Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {soldComps.map((item, i) => (
                      <tr key={i} className="hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {item.image_url && (
                              <img src={item.image_url} alt="" className="w-8 h-11 object-cover rounded bg-slate-700" />
                            )}
                            <p className="text-sm text-white line-clamp-2">{item.title}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-emerald-400 font-bold">{fmt(item.price)}</td>
                        <td className="px-4 py-3 text-slate-400 text-sm">{fmtDate(item.sold_date)}</td>
                        <td className="px-4 py-3">
                          {item.item_url && (
                            <a href={item.item_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 text-sm">
                              View →
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Instructions */}
      {!submitted && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <h3 className="text-white font-medium mb-3">How to use Price Lookup</h3>
          <ul className="space-y-2 text-slate-400 text-sm">
            <li>• Search for the card by player name, set, year, and condition</li>
            <li>• Use the game filter to narrow results by category</li>
            <li>• Select a SportscardsPro result to view full Market / Low / Mid / High pricing</li>
            <li>• Compare with recent completed eBay sales</li>
          </ul>
        </div>
      )}
    </div>
  )
}
