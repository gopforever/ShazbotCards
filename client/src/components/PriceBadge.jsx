import { fmt } from './badges'

export default function PriceBadge({ price, label = 'Market', updated }) {
  if (price == null) return (
    <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-slate-500 text-sm">—</p>
    </div>
  )

  return (
    <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-emerald-400 font-bold text-lg">{fmt(price)}</p>
      {updated && <p className="text-xs text-slate-500 mt-0.5">Updated {new Date(updated).toLocaleDateString()}</p>}
    </div>
  )
}
