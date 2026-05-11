import { useState } from 'react'
import { fmt, fmtDate } from './badges'

export default function EbayPanel({ card, onList }) {
  const [price, setPrice] = useState(card.my_price || card.market_price || '')
  const [desc, setDesc] = useState('')

  if (card.status === 'listed' && card.ebay_listing_url) {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <p className="text-blue-400 font-medium text-sm">Active eBay Listing</p>
        </div>
        <a href={card.ebay_listing_url} target="_blank" rel="noopener noreferrer"
           className="text-indigo-400 hover:text-indigo-300 text-sm break-all">
          {card.ebay_listing_url}
        </a>
        <p className="text-slate-400 text-sm">Listed for: <span className="text-white">{fmt(card.my_price)}</span></p>
      </div>
    )
  }

  if (card.status === 'sold') {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded-xl p-4 space-y-2">
        <p className="text-emerald-400 font-medium text-sm">✓ Sold</p>
        <p className="text-slate-400 text-sm">Sold Price: <span className="text-white font-bold">{fmt(card.sold_price)}</span></p>
        <p className="text-slate-400 text-sm">Sold Date: <span className="text-white">{fmtDate(card.sold_date)}</span></p>
      </div>
    )
  }

  return (
    <div className="bg-slate-700 border border-slate-600 rounded-xl p-4 space-y-3">
      <p className="text-slate-300 font-medium text-sm">List on eBay</p>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Listing Price ($)</label>
        <input
          type="number"
          step="0.01"
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-full bg-slate-600 border border-slate-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Description (optional)</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={2}
          className="w-full bg-slate-600 border border-slate-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
          placeholder="Add description..."
        />
      </div>
      <button
        onClick={() => onList({ price: parseFloat(price), description: desc })}
        disabled={!price}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
      >
        Create eBay Listing
      </button>
    </div>
  )
}
