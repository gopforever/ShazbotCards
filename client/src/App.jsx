import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import CardDetail from './pages/CardDetail'
import AddCard from './pages/AddCard'
import EditCard from './pages/EditCard'
import EbayListings from './pages/EbayListings'
import PriceLookup from './pages/PriceLookup'
import Settings from './pages/Settings'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="cards/:id" element={<CardDetail />} />
          <Route path="cards/add" element={<AddCard />} />
          <Route path="cards/:id/edit" element={<EditCard />} />
          <Route path="ebay" element={<EbayListings />} />
          <Route path="pricing" element={<PriceLookup />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </div>
  )
}
