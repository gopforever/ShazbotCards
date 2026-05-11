import { MagnifyingGlassIcon, FunnelIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline'

const CONDITIONS = [
  'PSA 10','PSA 9','PSA 8','PSA 7','PSA 6','PSA 5','PSA 4','PSA 3','PSA 2','PSA 1',
  'BGS 10','BGS 9.5','BGS 9','BGS 8.5','BGS 8',
  'Raw NM/M','Raw NM','Raw EX/NM','Raw EX','Raw VG/EX','Raw VG','Raw GD','Raw FR','Raw PO'
]

const SPORTS = ['baseball','basketball','football','hockey','soccer','golf','tennis','ufc','wrestling','other']

export default function FilterBar({ filters, onFilterChange }) {
  const { search='', type='', status='', sport='', condition='', sort='created_at', order='desc' } = filters

  const update = (key, val) => onFilterChange({ ...filters, [key]: val, page: 1 })

  const selectClass = "bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
  const inputClass = "bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 pl-9 focus:outline-none focus:border-indigo-500"

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, player, set..."
            value={search}
            onChange={e => update('search', e.target.value)}
            className={inputClass + ' w-full'}
          />
        </div>

        {/* Type */}
        <select value={type} onChange={e => update('type', e.target.value)} className={selectClass}>
          <option value="">All Types</option>
          <option value="sports">Sports</option>
          <option value="pokemon">Pokémon</option>
          <option value="mtg">MTG</option>
        </select>

        {/* Status */}
        <select value={status} onChange={e => update('status', e.target.value)} className={selectClass}>
          <option value="">All Statuses</option>
          <option value="in_stock">In Stock</option>
          <option value="listed">Listed</option>
          <option value="sold">Sold</option>
          <option value="off_market">Off Market</option>
        </select>

        {/* Sport (only when type=sports) */}
        {type === 'sports' && (
          <select value={sport} onChange={e => update('sport', e.target.value)} className={selectClass}>
            <option value="">All Sports</option>
            {SPORTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        )}

        {/* Condition */}
        <select value={condition} onChange={e => update('condition', e.target.value)} className={selectClass}>
          <option value="">All Conditions</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Sort */}
        <select value={sort} onChange={e => update('sort', e.target.value)} className={selectClass}>
          <option value="created_at">Date Added</option>
          <option value="name">Name</option>
          <option value="player_name">Player</option>
          <option value="set_name">Set</option>
          <option value="condition">Condition</option>
          <option value="purchase_price">Cost</option>
          <option value="market_price">Market Price</option>
          <option value="status">Status</option>
        </select>

        {/* Sort Dir */}
        <button
          onClick={() => update('order', order === 'desc' ? 'asc' : 'desc')}
          className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors"
          title={order === 'desc' ? 'Descending' : 'Ascending'}
        >
          <ChevronUpDownIcon className="w-4 h-4" />
        </button>

        {/* Clear */}
        {(search || type || status || sport || condition) && (
          <button
            onClick={() => onFilterChange({ sort, order, page: 1 })}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
