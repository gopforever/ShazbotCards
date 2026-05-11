import { useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'

const CONDITIONS = [
  'PSA 10','PSA 9','PSA 8','PSA 7','PSA 6','PSA 5','PSA 4','PSA 3','PSA 2','PSA 1',
  'BGS 10','BGS 9.5','BGS 9','BGS 8.5','BGS 8',
  'Raw NM/M','Raw NM','Raw EX/NM','Raw EX','Raw VG/EX','Raw VG','Raw GD','Raw FR','Raw PO'
]
const SPORTS = ['baseball','basketball','football','hockey','soccer','golf','tennis','ufc','wrestling','other']

const STEPS = ['Card Type', 'Basic Info', 'Type Details', 'Pricing']

function Input({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input
        {...props}
        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-500"
      />
    </div>
  )
}

function Select({ label, children, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <select
        {...props}
        className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
      >
        {children}
      </select>
    </div>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded border-slate-600 text-indigo-600 focus:ring-indigo-500 bg-slate-700" />
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

export default function CardForm({ initialData = {}, onSubmit, isSubmitting }) {
  const [step, setStep] = useState(initialData.type ? 1 : 0)
  const [data, setData] = useState({
    type: '', name: '', year: '', manufacturer: '', set_name: '', card_number: '',
    condition: '', quantity: 1, notes: '',
    // Sports
    player_name: '', team: '', sport: '', parallel: '', print_run: '', serial_number: '',
    autograph: false, relic: false, rookie_card: false,
    // Pokemon
    pokemon_name: '', hp: '', rarity: '', first_edition: false, shadowless: false, holo: false, reverse_holo: false,
    // MTG
    card_color: '', mana_cost: '', card_type: '', foil: false, format_legality: '',
    // Pricing
    purchase_price: '', purchase_date: '', my_price: '',
    tcg_product_id: '', sportscards_id: '',
    ...initialData,
    autograph: !!initialData.autograph,
    relic: !!initialData.relic,
    rookie_card: !!initialData.rookie_card,
    first_edition: !!initialData.first_edition,
    shadowless: !!initialData.shadowless,
    holo: !!initialData.holo,
    reverse_holo: !!initialData.reverse_holo,
    foil: !!initialData.foil,
  })

  const set = (key, val) => setData(prev => ({ ...prev, [key]: val }))

  const handleSubmit = (e) => {
    e?.preventDefault()
    const payload = { ...data }
    // Convert booleans to integers for SQLite
    ;['autograph','relic','rookie_card','first_edition','shadowless','holo','reverse_holo','foil'].forEach(k => {
      payload[k] = payload[k] ? 1 : 0
    })
    // Convert numbers
    ;['year','quantity','print_run','hp'].forEach(k => {
      if (payload[k] !== '' && payload[k] != null) payload[k] = parseInt(payload[k], 10) || null
    })
    ;['purchase_price','my_price'].forEach(k => {
      if (payload[k] !== '' && payload[k] != null) payload[k] = parseFloat(payload[k]) || null
    })
    onSubmit(payload)
  }

  const nextStep = () => setStep(s => Math.min(s + 1, 4))
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i < step ? 'bg-indigo-600 text-white' :
              i === step ? 'bg-indigo-600 text-white ring-2 ring-indigo-400' :
              'bg-slate-700 text-slate-400'
            }`}>
              {i < step ? <CheckIcon className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-white' : 'text-slate-500'}`}>{label}</span>
            {i < STEPS.length - 1 && <div className={`h-px flex-1 min-w-4 ${i < step ? 'bg-indigo-600' : 'bg-slate-700'}`} />}
          </div>
        ))}
      </div>

      {/* Step 0: Type */}
      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Choose Card Type</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { type: 'sports', emoji: '⚾', label: 'Sports Card', desc: 'Baseball, Basketball, Football, Hockey...' },
              { type: 'pokemon', emoji: '⚡', label: 'Pokémon Card', desc: 'All sets, editions, and languages' },
              { type: 'mtg', emoji: '🔮', label: 'Magic: The Gathering', desc: 'All formats and sets' }
            ].map(({ type, emoji, label, desc }) => (
              <button
                key={type}
                onClick={() => { set('type', type); nextStep() }}
                className={`p-6 rounded-xl border-2 text-center transition-all hover:scale-105 ${
                  data.type === type
                    ? 'border-indigo-500 bg-indigo-600/20'
                    : 'border-slate-600 bg-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="text-4xl mb-3">{emoji}</div>
                <p className="text-white font-semibold">{label}</p>
                <p className="text-slate-400 text-xs mt-1">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Input label="Card Name *" value={data.name} onChange={e => set('name', e.target.value)} placeholder="e.g. 2023 Topps Chrome" required />
            </div>
            <Input label="Set Name" value={data.set_name} onChange={e => set('set_name', e.target.value)} placeholder="e.g. Topps Chrome" />
            <Input label="Card Number" value={data.card_number} onChange={e => set('card_number', e.target.value)} placeholder="e.g. #123" />
            <Input label="Year" type="number" value={data.year} onChange={e => set('year', e.target.value)} placeholder="2023" />
            <Input label="Manufacturer" value={data.manufacturer} onChange={e => set('manufacturer', e.target.value)} placeholder="e.g. Topps, Panini" />
            <Select label="Condition" value={data.condition} onChange={e => set('condition', e.target.value)}>
              <option value="">Select condition...</option>
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Input label="Quantity" type="number" min="1" value={data.quantity} onChange={e => set('quantity', e.target.value)} />
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
              <textarea
                value={data.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes..."
                className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-500 resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Type-specific */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            {data.type === 'sports' ? '⚾ Sports Card Details' :
             data.type === 'pokemon' ? '⚡ Pokémon Card Details' : '🔮 MTG Card Details'}
          </h3>

          {data.type === 'sports' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Player Name" value={data.player_name} onChange={e => set('player_name', e.target.value)} placeholder="e.g. Mike Trout" />
              <Input label="Team" value={data.team} onChange={e => set('team', e.target.value)} placeholder="e.g. Los Angeles Angels" />
              <Select label="Sport" value={data.sport} onChange={e => set('sport', e.target.value)}>
                <option value="">Select sport...</option>
                {SPORTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </Select>
              <Input label="Parallel" value={data.parallel} onChange={e => set('parallel', e.target.value)} placeholder="e.g. Gold Refractor" />
              <Input label="Print Run" type="number" value={data.print_run} onChange={e => set('print_run', e.target.value)} placeholder="e.g. 99" />
              <Input label="Serial Number" value={data.serial_number} onChange={e => set('serial_number', e.target.value)} placeholder="e.g. 42/99" />
              <Input label="sportscards.com ID" value={data.sportscards_id} onChange={e => set('sportscards_id', e.target.value)} placeholder="For price lookup" />
              <div className="col-span-2 flex flex-wrap gap-4">
                <Checkbox label="Autograph" checked={data.autograph} onChange={e => set('autograph', e.target.checked)} />
                <Checkbox label="Relic / Memorabilia" checked={data.relic} onChange={e => set('relic', e.target.checked)} />
                <Checkbox label="Rookie Card" checked={data.rookie_card} onChange={e => set('rookie_card', e.target.checked)} />
              </div>
            </div>
          )}

          {data.type === 'pokemon' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Pokémon Name" value={data.pokemon_name} onChange={e => set('pokemon_name', e.target.value)} placeholder="e.g. Charizard" />
              <Input label="HP" type="number" value={data.hp} onChange={e => set('hp', e.target.value)} placeholder="e.g. 150" />
              <Input label="Rarity" value={data.rarity} onChange={e => set('rarity', e.target.value)} placeholder="e.g. Rare Holo V" />
              <Input label="TCGPlayer Product ID" value={data.tcg_product_id} onChange={e => set('tcg_product_id', e.target.value)} placeholder="For price lookup" />
              <div className="col-span-2 flex flex-wrap gap-4">
                <Checkbox label="1st Edition" checked={data.first_edition} onChange={e => set('first_edition', e.target.checked)} />
                <Checkbox label="Shadowless" checked={data.shadowless} onChange={e => set('shadowless', e.target.checked)} />
                <Checkbox label="Holo" checked={data.holo} onChange={e => set('holo', e.target.checked)} />
                <Checkbox label="Reverse Holo" checked={data.reverse_holo} onChange={e => set('reverse_holo', e.target.checked)} />
              </div>
            </div>
          )}

          {data.type === 'mtg' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Card Color(s)" value={data.card_color} onChange={e => set('card_color', e.target.value)} placeholder="e.g. Blue, Red" />
              <Input label="Mana Cost" value={data.mana_cost} onChange={e => set('mana_cost', e.target.value)} placeholder="e.g. {3}{U}{U}" />
              <Input label="Card Type" value={data.card_type} onChange={e => set('card_type', e.target.value)} placeholder="e.g. Instant, Creature" />
              <Input label="Format Legality" value={data.format_legality} onChange={e => set('format_legality', e.target.value)} placeholder="e.g. Standard, Modern" />
              <Input label="TCGPlayer Product ID" value={data.tcg_product_id} onChange={e => set('tcg_product_id', e.target.value)} placeholder="For price lookup" />
              <div className="col-span-2">
                <Checkbox label="Foil" checked={data.foil} onChange={e => set('foil', e.target.checked)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Pricing */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Pricing</h3>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Purchase Price ($)" type="number" step="0.01" value={data.purchase_price} onChange={e => set('purchase_price', e.target.value)} placeholder="0.00" />
            <Input label="Purchase Date" type="date" value={data.purchase_date} onChange={e => set('purchase_date', e.target.value)} />
            <Input label="My Asking Price ($)" type="number" step="0.01" value={data.my_price} onChange={e => set('my_price', e.target.value)} placeholder="0.00" />
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-700">
        <button
          type="button"
          onClick={prevStep}
          disabled={step === 0}
          className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Back
        </button>

        <div className="flex items-center gap-3">
          {step < 3 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={step === 0 && !data.type}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !data.name || !data.type}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isSubmitting ? 'Saving...' : 'Save Card'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
