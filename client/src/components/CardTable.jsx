import { Link } from 'react-router-dom'
import { PencilIcon, TrashIcon, EyeIcon, TagIcon } from '@heroicons/react/24/outline'
import { typeBadge, statusBadge, typeLabel, statusLabel, fmt, fmtDate } from './badges'

export default function CardTable({ cards, onDelete, onListEbay, sortConfig, onSort }) {
  const SortHeader = ({ col, children }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white select-none"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortConfig?.sort === col && (
          <span className="text-indigo-400">{sortConfig.order === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  )

  if (!cards?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
        <p className="text-slate-400 text-lg">No cards found</p>
        <p className="text-slate-500 text-sm mt-1">Try adjusting your filters or add some cards</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50 border-b border-slate-700">
            <tr>
              <th className="px-3 py-3 w-12"></th>
              <SortHeader col="type">Type</SortHeader>
              <SortHeader col="name">Name / Player</SortHeader>
              <SortHeader col="set_name">Set</SortHeader>
              <th className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">#</th>
              <SortHeader col="condition">Condition</SortHeader>
              <SortHeader col="quantity">Qty</SortHeader>
              <SortHeader col="purchase_price">Cost</SortHeader>
              <SortHeader col="market_price">Market</SortHeader>
              <SortHeader col="my_price">My Price</SortHeader>
              <SortHeader col="status">Status</SortHeader>
              <th className="px-3 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {cards.map((card, idx) => (
              <tr key={card.id} className={`${idx % 2 === 0 ? 'bg-slate-800' : 'bg-slate-800/50'} hover:bg-slate-700/50 transition-colors`}>
                {/* Thumbnail */}
                <td className="px-3 py-2">
                  {card.primary_image ? (
                    <img src={card.primary_image} alt="" className="w-10 h-14 object-cover rounded bg-slate-700" />
                  ) : (
                    <div className="w-10 h-14 bg-slate-700 rounded flex items-center justify-center">
                      <span className="text-slate-500 text-xs">?</span>
                    </div>
                  )}
                </td>
                {/* Type */}
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${typeBadge(card.type)}`}>
                    {typeLabel(card.type)}
                  </span>
                </td>
                {/* Name */}
                <td className="px-3 py-2">
                  <Link to={`/cards/${card.id}`} className="text-white font-medium hover:text-indigo-400 transition-colors block">
                    {card.player_name || card.pokemon_name || card.name}
                  </Link>
                  {card.player_name && <span className="text-slate-400 text-xs">{card.name}</span>}
                </td>
                {/* Set */}
                <td className="px-3 py-2 text-slate-300 text-sm">{card.set_name || '-'}</td>
                {/* Card # */}
                <td className="px-3 py-2 text-slate-400 text-sm">{card.card_number || '-'}</td>
                {/* Condition */}
                <td className="px-3 py-2 text-slate-300 text-sm whitespace-nowrap">{card.condition || '-'}</td>
                {/* Qty */}
                <td className="px-3 py-2 text-slate-300 text-sm text-center">{card.quantity || 1}</td>
                {/* Cost */}
                <td className="px-3 py-2 text-slate-300 text-sm">{fmt(card.purchase_price)}</td>
                {/* Market */}
                <td className="px-3 py-2 text-emerald-400 text-sm font-medium">{fmt(card.market_price)}</td>
                {/* My Price */}
                <td className="px-3 py-2 text-blue-400 text-sm">{fmt(card.my_price)}</td>
                {/* Status */}
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(card.status)}`}>
                    {statusLabel(card.status)}
                  </span>
                </td>
                {/* Actions */}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/cards/${card.id}`} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="View">
                      <EyeIcon className="w-4 h-4" />
                    </Link>
                    <Link to={`/cards/${card.id}/edit`} className="p-1.5 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-700 transition-colors" title="Edit">
                      <PencilIcon className="w-4 h-4" />
                    </Link>
                    {card.status === 'in_stock' && (
                      <button onClick={() => onListEbay(card)} className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors" title="List on eBay">
                        <TagIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => onDelete(card)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors" title="Delete">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
