import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getEbaySold as getEbaySoldComps } from '../api/pricing'
import { fmt, fmtDate } from '../components/badges'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

export default function PriceLookup() {
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')

  const { data: soldComps, isLoading, error } = useQuery({
    queryKey: ['ebay-sold-comps', submitted],
    queryFn: () => getEbaySoldComps(submitted),
    enabled: !!submitted
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setSubmitted(query.trim())
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Price Lookup</h1>
        <p className="text-slate-400 text-sm mt-0.5">Search recent eBay sold listings to find current market prices</p>
      </div>

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3">
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
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {/* Results */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400 text-sm">{error.message}</p>
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
            <li>• Results show recent completed eBay sales</li>
            <li>• Use the average price as a market value reference</li>
            <li>• Requires your eBay App ID to be configured in <a href="/settings" className="text-indigo-400 hover:text-indigo-300">Settings</a></li>
          </ul>
        </div>
      )}
    </div>
  )
}
