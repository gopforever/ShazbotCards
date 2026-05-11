import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getDashboardStats, getRecentCards, getChartData, getTopValueCards, getRecentlySold } from '../api/dashboard'
import StatCard from '../components/StatCard'
import { typeBadge, statusBadge, typeLabel, statusLabel, fmt, fmtDate } from '../components/badges'
import {
  ArchiveBoxIcon, CurrencyDollarIcon, ArrowTrendingUpIcon,
  ArrowTrendingDownIcon, TagIcon, ShoppingBagIcon, PlusIcon
} from '@heroicons/react/24/outline'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

function LoadingSpinner() {
  return <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ['dashboard-stats'], queryFn: getDashboardStats })
  const { data: recent } = useQuery({ queryKey: ['dashboard-recent'], queryFn: getRecentCards })
  const { data: chartData } = useQuery({ queryKey: ['dashboard-chart'], queryFn: getChartData })
  const { data: topValue } = useQuery({ queryKey: ['dashboard-top-value'], queryFn: getTopValueCards })
  const { data: recentlySold } = useQuery({ queryKey: ['dashboard-recently-sold'], queryFn: getRecentlySold })

  if (statsLoading) return <LoadingSpinner />

  const profitColor = (stats?.profit_loss || 0) >= 0 ? 'green' : 'red'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Your card inventory at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/cards/add" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <PlusIcon className="w-4 h-4" />
            Add Card
          </Link>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Total Cards"
          value={stats?.total_cards?.toLocaleString() || '0'}
          icon={ArchiveBoxIcon}
          color="indigo"
        />
        <StatCard
          label="Inventory Value"
          value={fmt(stats?.inventory_value)}
          sub="Market price"
          icon={CurrencyDollarIcon}
          color="green"
        />
        <StatCard
          label="Cost Basis"
          value={fmt(stats?.cost_basis)}
          sub="Total invested"
          icon={CurrencyDollarIcon}
          color="blue"
        />
        <StatCard
          label="Net Profit/Loss"
          value={fmt(stats?.profit_loss)}
          sub="From sold cards"
          icon={profitColor === 'green' ? ArrowTrendingUpIcon : ArrowTrendingDownIcon}
          color={profitColor}
        />
        <StatCard
          label="Listed on eBay"
          value={stats?.listed_count?.toLocaleString() || '0'}
          icon={TagIcon}
          color="blue"
        />
        <StatCard
          label="Sold This Month"
          value={stats?.sold_this_month?.toLocaleString() || '0'}
          sub={stats?.avg_sell_price ? `Avg: ${fmt(stats.avg_sell_price)}` : ''}
          icon={ShoppingBagIcon}
          color="yellow"
        />
      </div>

      {/* Chart */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Acquisitions vs Sales (Last 12 Months)</h2>
        {chartData ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }} />
              <Legend wrapperStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="acquired" name="Acquired" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="sold" name="Sold" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-500">Loading chart...</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          {recent?.length ? (
            <div className="space-y-2">
              {recent.map(card => (
                <Link key={card.id} to={`/cards/${card.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 transition-colors">
                  <div className="w-8 h-11 bg-slate-700 rounded overflow-hidden flex-shrink-0">
                    {card.primary_image && <img src={card.primary_image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{card.player_name || card.pokemon_name || card.name}</p>
                    <p className="text-xs text-slate-400 truncate">{card.set_name || card.type}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs border ${statusBadge(card.status)}`}>
                      {statusLabel(card.status)}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(card.updated_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No cards yet. <Link to="/cards/add" className="text-indigo-400 hover:text-indigo-300">Add your first card</Link></p>
          )}
        </div>

        {/* Top Value Cards */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Top Value Cards</h2>
          {topValue?.length ? (
            <div className="space-y-2">
              {topValue.map((card, idx) => (
                <Link key={card.id} to={`/cards/${card.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700 transition-colors">
                  <span className="text-slate-500 text-sm w-5 text-right flex-shrink-0">{idx + 1}.</span>
                  <div className="w-8 h-11 bg-slate-700 rounded overflow-hidden flex-shrink-0">
                    {card.primary_image && <img src={card.primary_image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{card.player_name || card.pokemon_name || card.name}</p>
                    <p className="text-xs text-slate-400 truncate">{card.set_name || '-'} • {card.condition || '-'}</p>
                  </div>
                  <p className="text-emerald-400 font-bold text-sm flex-shrink-0">{fmt(card.market_price)}</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No priced cards yet.</p>
          )}
        </div>
      </div>

      {/* Recently Sold */}
      {recentlySold?.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Recently Sold</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
                  <th className="pb-2">Card</th>
                  <th className="pb-2">Sold Price</th>
                  <th className="pb-2">Cost</th>
                  <th className="pb-2">Profit</th>
                  <th className="pb-2">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {recentlySold.map(card => {
                  const profit = (card.sold_price || 0) - (card.purchase_price || 0)
                  return (
                    <tr key={card.id} className="text-sm">
                      <td className="py-2">
                        <Link to={`/cards/${card.id}`} className="text-white hover:text-indigo-400">
                          {card.player_name || card.pokemon_name || card.name}
                        </Link>
                      </td>
                      <td className="py-2 text-emerald-400 font-medium">{fmt(card.sold_price)}</td>
                      <td className="py-2 text-slate-400">{fmt(card.purchase_price)}</td>
                      <td className={`py-2 font-medium ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(profit)}</td>
                      <td className="py-2 text-slate-400">{fmtDate(card.sold_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
