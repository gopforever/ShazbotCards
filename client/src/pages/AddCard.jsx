import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { createCard } from '../api/cards'
import { uploadImages } from '../api/cards'
import CardForm from '../components/CardForm'
import ImageUploader from '../components/ImageUploader'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

export default function AddCard() {
  const navigate = useNavigate()
  const [createdCardId, setCreatedCardId] = useState(null)
  const [step, setStep] = useState('form') // 'form' | 'images'

  const createMutation = useMutation({
    mutationFn: createCard,
    onSuccess: (card) => {
      setCreatedCardId(card.id)
      setStep('images')
      toast.success('Card saved! Now add images.')
    },
    onError: err => toast.error(err.message)
  })

  const handleFormSubmit = (data) => {
    createMutation.mutate(data)
  }

  const handleImagesDone = () => {
    toast.success('Images uploaded!')
    navigate(`/cards/${createdCardId}`)
  }

  const handleSkipImages = () => {
    navigate(`/cards/${createdCardId}`)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/inventory" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Add New Card</h1>
          <p className="text-slate-400 text-sm mt-0.5">Fill in the details below</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
        {step === 'form' ? (
          <CardForm
            onSubmit={handleFormSubmit}
            isSubmitting={createMutation.isPending}
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Add Images</h2>
              <p className="text-slate-400 text-sm mt-1">Upload images of your card (front, back, etc.)</p>
            </div>
            <ImageUploader
              cardId={createdCardId}
              onUploadDone={handleImagesDone}
            />
            <button
              onClick={handleSkipImages}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Skip for now →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
