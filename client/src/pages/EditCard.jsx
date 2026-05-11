import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getCard, updateCard } from '../api/cards'
import CardForm from '../components/CardForm'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'

export default function EditCard() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: card, isLoading } = useQuery({
    queryKey: ['card', id],
    queryFn: () => getCard(id)
  })

  const updateMutation = useMutation({
    mutationFn: (data) => updateCard(id, data),
    onSuccess: (updated) => {
      toast.success('Card updated!')
      qc.setQueryData(['card', id], old => ({ ...old, ...updated }))
      qc.invalidateQueries(['cards'])
      navigate(`/cards/${id}`)
    },
    onError: err => toast.error(err.message)
  })

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!card) return <div className="text-slate-400">Card not found</div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/cards/${id}`} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Edit Card</h1>
          <p className="text-slate-400 text-sm mt-0.5">{card.player_name || card.pokemon_name || card.name}</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        <CardForm
          initialData={card}
          onSubmit={updateMutation.mutate}
          isSubmitting={updateMutation.isPending}
        />
      </div>
    </div>
  )
}
