import { useState, useRef } from 'react'
import { CloudArrowUpIcon, XMarkIcon, StarIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'

export default function ImageUploader({ cardId, existingImages = [], onUploadDone }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    addFiles(dropped)
  }

  const addFiles = (newFiles) => {
    const mapped = newFiles.slice(0, 10 - files.length).map((f, i) => ({
      file: f,
      preview: URL.createObjectURL(f),
      side: 'front',
      isPrimary: files.length === 0 && i === 0 && existingImages.length === 0
    }))
    setFiles(prev => [...prev, ...mapped])
  }

  const removeFile = (idx) => {
    setFiles(prev => {
      const updated = prev.filter((_, i) => i !== idx)
      // If removed was primary, make first new one primary
      if (prev[idx].isPrimary && updated.length > 0) {
        updated[0].isPrimary = true
      }
      return updated
    })
  }

  const setPrimary = (idx) => {
    setFiles(prev => prev.map((f, i) => ({ ...f, isPrimary: i === idx })))
  }

  const setSide = (idx, side) => {
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, side } : f))
  }

  const handleUpload = async () => {
    if (!files.length || !cardId) return
    setUploading(true)
    try {
      const formData = new FormData()
      files.forEach(f => formData.append('images', f.file))
      const sides = files.map(f => f.side)
      sides.forEach(s => formData.append('sides', s))
      const primaryIdx = files.findIndex(f => f.isPrimary)
      formData.append('primary_index', primaryIdx >= 0 ? primaryIdx : 0)

      const res = await fetch(`/api/images/upload/${cardId}`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }
      const data = await res.json()
      setFiles([])
      if (onUploadDone) onUploadDone(data)
    } catch (err) {
      alert(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500'
        }`}
      >
        <CloudArrowUpIcon className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="text-slate-300 font-medium">Drop images here or click to browse</p>
        <p className="text-slate-500 text-sm mt-1">JPG, PNG, GIF, WebP — up to 10 images, 10MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => addFiles(Array.from(e.target.files))}
        />
      </div>

      {/* Preview grid */}
      {files.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {files.map((f, idx) => (
            <div key={idx} className="bg-slate-700 rounded-lg overflow-hidden border border-slate-600">
              <div className="relative aspect-[3/4]">
                <img src={f.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeFile(idx)}
                  className="absolute top-1 right-1 p-0.5 bg-black/60 rounded-full text-white hover:bg-red-600 transition-colors"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setPrimary(idx)}
                  className={`absolute top-1 left-1 p-0.5 rounded-full transition-colors ${
                    f.isPrimary ? 'text-yellow-400' : 'text-white/60 hover:text-yellow-400'
                  }`}
                  title="Set as primary"
                >
                  {f.isPrimary ? <StarSolid className="w-4 h-4" /> : <StarIcon className="w-4 h-4" />}
                </button>
              </div>
              <div className="p-2">
                <select
                  value={f.side}
                  onChange={e => setSide(idx, e.target.value)}
                  className="w-full bg-slate-600 border border-slate-500 text-white text-xs rounded px-1.5 py-1 focus:outline-none"
                >
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && cardId && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {uploading ? 'Uploading...' : `Upload ${files.length} Image${files.length > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Existing images */}
      {existingImages.length > 0 && (
        <div>
          <p className="text-sm text-slate-400 mb-2">Uploaded Images ({existingImages.length})</p>
          <div className="grid grid-cols-4 gap-2">
            {existingImages.map(img => (
              <div key={img.id} className="relative bg-slate-700 rounded-lg overflow-hidden aspect-[3/4]">
                <img src={img.file_path} alt="" className="w-full h-full object-cover" />
                {img.is_primary === 1 && (
                  <div className="absolute top-1 left-1">
                    <StarSolid className="w-4 h-4 text-yellow-400" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 px-1 text-center">
                  <span className="text-white text-xs">{img.side}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
