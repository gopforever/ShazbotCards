// Shared badge/helper utilities

export function typeBadge(type) {
  const map = {
    sports: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    pokemon: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    mtg: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  }
  return map[type] || 'bg-slate-700 text-slate-300 border-slate-600'
}

export function statusBadge(status) {
  const map = {
    in_stock: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    listed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    sold: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    off_market: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
  }
  return map[status] || 'bg-slate-700 text-slate-300 border-slate-600'
}

export function typeLabel(type) {
  const map = { sports: 'Sports', pokemon: 'Pokémon', mtg: 'MTG' }
  return map[type] || type
}

export function statusLabel(status) {
  const map = { in_stock: 'In Stock', listed: 'Listed', sold: 'Sold', off_market: 'Off Market' }
  return map[status] || status
}

export function fmt(num, decimals = 2) {
  if (num == null || isNaN(num)) return '-'
  return `$${Number(num).toFixed(decimals)}`
}

export function fmtDate(str) {
  if (!str) return '-'
  return new Date(str).toLocaleDateString()
}
