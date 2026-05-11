import { NavLink } from 'react-router-dom'
import {
  HomeIcon, ArchiveBoxIcon, CreditCardIcon,
  TagIcon, MagnifyingGlassIcon, Cog6ToothIcon
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/dashboard', icon: HomeIcon, label: 'Dashboard' },
  { to: '/inventory', icon: ArchiveBoxIcon, label: 'Inventory' },
  { to: '/ebay', icon: TagIcon, label: 'eBay Listings' },
  { to: '/pricing', icon: MagnifyingGlassIcon, label: 'Price Lookup' },
  { to: '/settings', icon: Cog6ToothIcon, label: 'Settings' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
            <CreditCardIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">ShazbotCards</h1>
            <p className="text-slate-400 text-xs">Card Inventory</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500 text-center">ShazbotCards v1.0</p>
      </div>
    </aside>
  )
}
