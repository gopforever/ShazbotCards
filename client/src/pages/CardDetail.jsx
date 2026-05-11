import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getCard, deleteCard } from '../api/cards'
import { updateCardPrice } from '../api/pricing'
import { listOnEbay } from '../api/ebay'
import PriceBadge from '../components/PriceBadge'
import EbayPanel from '../components/EbayPanel'
import Modal from '../components/Modal'
import ImageUploader from '../components/ImageUploader'
import { typeBadge, statusBadge, typeLabel, statusLabel, fmt, fmtDate } from '../components/badges'
import { PencilIcon, TrashIcon, ArrowLeftIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { deleteImage, setPrimaryImage } from '../api/cards'
import { StarIcon } from '@heroicons/react/24/solid'

export default function CardDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [selectedImage, setSelectedImage] = useState(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [uploadModal, setUploadModal] = useState(false)

  const { data: card, isLoading, error, refetch } = useQuery({
    queryKey: ['card', id],
    queryFn: () => getCard(id)
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: () => {
      toast.success('Card deleted')
      navigate('/inventory')
    },
    onError: err => toast.error(err.message)
  })

  const priceMutation = useMutation({
    mutationFn: () => updateCardPrice(id),
    onSuccess: (data) => {
      toast.success(`Price updated: ${fmt(data.price)}`)
      refetch()
    },
    onError: err => toast.error(err.message)
  })

  const ebayMutation = useMutation({
    mutationFn: (data) => listOnEbay(id, data),
    onSuccess: () => {
      toast.success('Listed on eBay!')
      refetch()
    },
    onError: err => toast.error(err.message)
  })

  const deleteImgMutation = useMutation({
    mutationFn: deleteImage,
    onSuccess: () => { toast.success('Image deleted'); refetch() },
    onError: err => toast.error(err.message)
  })

  const setPrimaryMutation = useMutation({
    mutationFn: setPrimaryImage,
    onSuccess: () => { toast.success('Primary image set'); refetch() },
    onError: err => toast.error(err.message)
  })

  if (isLoading) return <div className="flex items-center justify-center p-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="text-red-400 p-4">Error: {error.message}</div>
  if (!card) return null

  const images = card.images || []
  const primaryImage = images.find(i => i.is_primary) || images[0]
  const displayImage = selectedImage || primaryImage

  const Field = ({ label, value }) => (
    value ? (
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
    ) : null
  )

  const BoolField = ({ label, value }) => (
    value ? (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
        {label}
      </span>
    ) : null
  )

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link to="/inventory" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${typeBadge(card.type)}`}>{typeLabel(card.type)}</span>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${statusBadge(card.status)}`}>{statusLabel(card.status)}</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{card.player_name || card.pokemon_name || card.name}</h1>
            {card.player_name && <p className="text-slate-400 text-sm">{card.name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/cards/${id}/edit`} className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors">
            <PencilIcon className="w-4 h-4" />
            Edit
          </Link>
          <button onClick={() => setDeleteModal(true)} className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors">
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Images */}
        <div className="space-y-4">
          {/* Main image */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {displayImage ? (
              <div className="relative group aspect-[3/4]">
                <img src={displayImage.file_path} alt="" className="w-full h-full object-contain bg-slate-900" />
                <button
                  onClick={() => window.open(displayImage.file_path, '_blank')}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ArrowsPointingOutIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="aspect-[3/4] flex items-center justify-center bg-slate-900">
                <span className="text-slate-500 text-6xl">🃏</span>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setSelectedImage(img)}
                  className={`relative aspect-[3/4] rounded-lg overflow-hidden cursor-pointer border-2 transition-colors ${
                    (selectedImage?.id || primaryImage?.id) === img.id ? 'border-indigo-500' : 'border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <img src={img.file_path} alt="" className="w-full h-full object-cover" />
                  {img.is_primary === 1 && <StarIcon className="absolute top-1 left-1 w-3 h-3 text-yellow-400" />}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 px-1 text-center">
                    <span className="text-white text-xs">{img.side}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image actions */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setUploadModal(true)} className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
              + Add Images
            </button>
            {displayImage && (
              <>
                {displayImage.is_primary !== 1 && (
                  <button onClick={() => setPrimaryMutation.mutate(displayImage.id)} className="text-sm px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors">
                    Set Primary
                  </button>
                )}
                <button onClick={() => deleteImgMutation.mutate(displayImage.id)} className="text-sm px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors">
                  Delete Image
                </button>
              </>
            )}
          </div>
        </div>

        {/* Center: Details */}
        <div className="space-y-4">
          {/* Common fields */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Card Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Set" value={card.set_name} />
              <Field label="Card Number" value={card.card_number} />
              <Field label="Year" value={card.year} />
              <Field label="Manufacturer" value={card.manufacturer} />
              <Field label="Condition" value={card.condition} />
              <Field label="Quantity" value={card.quantity} />
            </div>
          </div>

          {/* Type-specific */}
          {card.type === 'sports' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Sports Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Player" value={card.player_name} />
                <Field label="Team" value={card.team} />
                <Field label="Sport" value={card.sport} />
                <Field label="Parallel" value={card.parallel} />
                <Field label="Print Run" value={card.print_run ? `/${card.print_run}` : null} />
                <Field label="Serial #" value={card.serial_number} />
              </div>
              <div className="flex flex-wrap gap-2">
                <BoolField label="Autograph" value={card.autograph} />
                <BoolField label="Relic" value={card.relic} />
                <BoolField label="Rookie Card" value={card.rookie_card} />
              </div>
            </div>
          )}

          {card.type === 'pokemon' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Pokémon Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Pokémon" value={card.pokemon_name} />
                <Field label="HP" value={card.hp} />
                <Field label="Rarity" value={card.rarity} />
              </div>
              <div className="flex flex-wrap gap-2">
                <BoolField label="1st Edition" value={card.first_edition} />
                <BoolField label="Shadowless" value={card.shadowless} />
                <BoolField label="Holo" value={card.holo} />
                <BoolField label="Reverse Holo" value={card.reverse_holo} />
              </div>
            </div>
          )}

          {card.type === 'mtg' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">MTG Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Field label="Color" value={card.card_color} />
                <Field label="Mana Cost" value={card.mana_cost} />
                <Field label="Type" value={card.card_type} />
                <Field label="Format" value={card.format_legality} />
              </div>
              <BoolField label="Foil" value={card.foil} />
            </div>
          )}

          {/* Notes */}
          {card.notes && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">Notes</h3>
              <p className="text-slate-300 text-sm">{card.notes}</p>
            </div>
          )}
        </div>

        {/* Right: Pricing & eBay */}
        <div className="space-y-4">
          {/* Pricing */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Pricing</h3>
              <button
                onClick={() => priceMutation.mutate()}
                disabled={priceMutation.isPending || (!card.tcg_product_id && !card.sportscards_id)}
                className="text-xs px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 rounded transition-colors disabled:opacity-40"
              >
                {priceMutation.isPending ? 'Refreshing...' : 'Refresh Price'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PriceBadge price={card.purchase_price} label="Purchase Price" />
              <PriceBadge price={card.market_price} label="Market Price" updated={card.market_price_updated} />
              <PriceBadge price={card.my_price} label="My Asking Price" />
              {card.sold_price && <PriceBadge price={card.sold_price} label="Sold Price" />}
            </div>
          </div>

          {/* Price history chart */}
          {card.price_history?.length > 1 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Price History</h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={card.price_history.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="recorded_at" tick={{ fill: '#94a3b8', fontSize: 10 }}
                    tickFormatter={v => new Date(v).toLocaleDateString()} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f1f5f9' }}
                    formatter={v => [`$${Number(v).toFixed(2)}`, 'Price']}
                  />
                  <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* eBay */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">eBay</h3>
            <EbayPanel card={card} onList={ebayMutation.mutate} />
          </div>

          {/* Dates */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Dates</h3>
            <div className="space-y-1.5">
              {card.purchase_date && <div className="flex justify-between text-sm"><span className="text-slate-400">Purchased</span><span className="text-white">{fmtDate(card.purchase_date)}</span></div>}
              <div className="flex justify-between text-sm"><span className="text-slate-400">Added</span><span className="text-white">{fmtDate(card.created_at)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Updated</span><span className="text-white">{fmtDate(card.updated_at)}</span></div>
              {card.sold_date && <div className="flex justify-between text-sm"><span className="text-slate-400">Sold</span><span className="text-white">{fmtDate(card.sold_date)}</span></div>}
            </div>
          </div>
        </div>
      </div>

      {/* Upload modal */}
      <Modal isOpen={uploadModal} onClose={() => setUploadModal(false)} title="Add Images" size="lg">
        <ImageUploader
          cardId={id}
          existingImages={images}
          onUploadDone={() => { refetch(); setUploadModal(false) }}
        />
      </Modal>

      {/* Delete modal */}
      <Modal isOpen={deleteModal} onClose={() => setDeleteModal(false)} title="Delete Card">
        <p className="text-slate-300">
          Are you sure you want to delete <strong className="text-white">{card.player_name || card.name}</strong>? This cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={() => setDeleteModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => deleteMutation.mutate(id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
