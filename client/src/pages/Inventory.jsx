import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getCards, deleteCard } from '../api/cards'
import { listOnEbay } from '../api/ebay'
import FilterBar from '../components/FilterBar'
import CardTable from '../components/CardTable'
import CardGrid from '../components/CardGrid'
import Modal from '../components/Modal'
import EbayPanel from '../components/EbayPanel'
import { TableCellsIcon, Squares2X2Icon, PlusIcon } from '@heroicons/react/24/outline'

export default function Inventory() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [view, setView] = useState('table')
  const [filters, setFilters] = useState({ sort: 'created_at', order: 'desc', page: 1, limit: 50 })
  const [deleteModal, setDeleteModal] = useState(null)
  const [ebayModal, setEbayModal] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['cards', filters],
    queryFn: () => getCards(filters)
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      toast.success('Card deleted')
      qc.invalidateQueries(['cards'])
      setDeleteModal(null)
    },
    onError: err => toast.error(err.message)
  })

  const ebayMutation = useMutation({
    mutationFn: ({ cardId, data }) => listOnEbay(cardId, data),
    onSuccess: () => {
      toast.success('Listed on eBay!')
      qc.invalidateQueries(['cards'])
      setEbayModal(null)
    },
    onError: err => toast.error(err.message)
  })

  const cards = data?.cards || []
  const pagination = data?.pagination || {}

  const sortConfig = { sort: filters.sort, order: filters.order }

  const handleSort = (col) => {
    setFilters(prev => ({
      ...prev,
      sort: col,
      order: prev.sort === col && prev.order === 'desc' ? 'asc' : 'desc',
      page: 1
    }))
  }

  if (error) return <div className="text-red-400 p-4">Error: {error.message}</div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {pagination.total ? `${pagination.total.toLocaleString()} cards` : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center bg-slate-700 rounded-lg p-1">
            <button
              onClick={() => setView('table')}
              className={`p-1.5 rounded ${view === 'table' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'} transition-colors`}
              title="Table view"
            >
              <TableCellsIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded ${view === 'grid' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'} transition-colors`}
              title="Grid view"
            >
              <Squares2X2Icon className="w-4 h-4" />
            </button>
          </div>
          <Link to="/cards/add" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <PlusIcon className="w-4 h-4" />
            Add Card
          </Link>
        </div>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onFilterChange={setFilters} />

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'table' ? (
        <CardTable
          cards={cards}
          sortConfig={sortConfig}
          onSort={handleSort}
          onDelete={setDeleteModal}
          onListEbay={setEbayModal}
        />
      ) : (
        <CardGrid cards={cards} onDelete={setDeleteModal} onListEbay={setEbayModal} />
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setFilters(p => ({ ...p, page: Math.max(1, p.page - 1) }))}
            disabled={filters.page <= 1}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            Previous
          </button>
          <span className="text-slate-400 text-sm">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            onClick={() => setFilters(p => ({ ...p, page: Math.min(pagination.pages, p.page + 1) }))}
            disabled={filters.page >= pagination.pages}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Delete modal */}
      <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete Card">
        <p className="text-slate-300">
          Are you sure you want to delete <strong className="text-white">{deleteModal?.player_name || deleteModal?.name}</strong>? This will also delete all associated images and cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={() => setDeleteModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate(deleteModal.id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Card'}
          </button>
        </div>
      </Modal>

      {/* eBay listing modal */}
      <Modal isOpen={!!ebayModal} onClose={() => setEbayModal(null)} title={`List on eBay: ${ebayModal?.name || ''}`}>
        {ebayModal && (
          <EbayPanel
            card={ebayModal}
            onList={(listData) => ebayMutation.mutate({ cardId: ebayModal.id, data: listData })}
          />
        )}
      </Modal>
    </div>
  )
}
