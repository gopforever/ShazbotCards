import { Link } from 'react-router-dom'
import { PencilIcon, TrashIcon, TagIcon } from '@heroicons/react/24/outline'
import { typeBadge, statusBadge, typeLabel, statusLabel, fmt } from './badges'

export default function CardGrid({ cards, onDelete, onListEbay }) {
  if (!cards?.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-12 text-center">
        <p className="text-slate-400 text-lg">No cards found</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map(card => (
        <div key={card.id} className="group bg-slate-800 border border-slate-700 rounded-xl overflow-hidden hover:border-indigo-500/50 transition-all">
          {/* Image */}
          <div className="relative aspect-[3/4] bg-slate-900">
            {card.primary_image ? (
              <img src={card.primary_image} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-slate-600 text-4xl">🃏</span>
              </div>
            )}
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Link to={`/cards/${card.id}/edit`} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-indigo-400 transition-colors">
                <PencilIcon className="w-4 h-4" />
              </Link>
              {card.status === 'in_stock' && (
                <button onClick={() => onListEbay(card)} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-blue-400 transition-colors">
                  <TagIcon className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => onDelete(card)} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-red-400 transition-colors">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
            {/* Type badge */}
            <div className="absolute top-2 left-2">
              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${typeBadge(card.type)}`}>
                {typeLabel(card.type)}
              </span>
            </div>
          </div>
          {/* Info */}
          <Link to={`/cards/${card.id}`} className="block p-3">
            <p className="text-white text-sm font-medium truncate">
              {card.player_name || card.pokemon_name || card.name}
            </p>
            <p className="text-slate-400 text-xs truncate">{card.set_name || '-'}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-slate-400">{card.condition || '-'}</span>
              {card.market_price ? (
                <span className="text-xs text-emerald-400 font-medium">{fmt(card.market_price)}</span>
              ) : null}
            </div>
            <div className="mt-1">
              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs border ${statusBadge(card.status)}`}>
                {statusLabel(card.status)}
              </span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
