import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { getSettings, saveSettings } from '../api/settings'
import { getEbayAuthUrl, getEbayStatus } from '../api/ebay'
import { EyeIcon, EyeSlashIcon, LinkIcon } from '@heroicons/react/24/outline'

function SettingField({ label, fieldKey, value, onChange, type = 'text', placeholder, masked, helpText }) {
  const [show, setShow] = useState(false)
  const isSecret = masked

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type={isSecret && !show ? 'password' : type}
          value={value || ''}
          onChange={e => onChange(fieldKey, e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-500 pr-10"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            {show ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
          </button>
        )}
      </div>
      {helpText && <p className="text-xs text-slate-500 mt-1">{helpText}</p>}
    </div>
  )
}

export default function Settings() {
  const [form, setForm] = useState({})
  const [saved, setSaved] = useState(false)

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings
  })

  const { data: ebayStatus } = useQuery({
    queryKey: ['ebay-status'],
    queryFn: getEbayStatus
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      toast.success('Settings saved!')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: err => toast.error(err.message)
  })

  const handleChange = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleConnectEbay = async () => {
    try {
      const { url } = await getEbayAuthUrl()
      window.location.href = url
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Configure API keys and preferences</p>
      </div>

      {/* sportscards.com */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-white font-semibold">sportscards.com API</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Get your API key at{' '}
            <a href="https://www.sportscards.com/api" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
              sportscards.com/api
            </a>
          </p>
        </div>
        <SettingField
          label="API Key"
          fieldKey="sportscards_api_key"
          value={form.sportscards_api_key}
          onChange={handleChange}
          masked
          placeholder="sk_..."
          helpText="Used for sports card and TCG pricing lookups"
        />
        <SettingField
          label="API Base URL"
          fieldKey="sportscards_api_base"
          value={form.sportscards_api_base}
          onChange={handleChange}
          placeholder="https://api.sportscards.com/v1"
        />
      </div>

      {/* TCGPlayer */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-white font-semibold">TCGPlayer API</h2>
          <p className="text-slate-400 text-xs mt-0.5">
            Get your API key at{' '}
            <a href="https://docs.tcgplayer.com/docs" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
              docs.tcgplayer.com
            </a>
          </p>
        </div>
        <SettingField
          label="TCGPlayer API Key"
          fieldKey="tcgplayer_api_key"
          value={form.tcgplayer_api_key}
          onChange={handleChange}
          masked
          placeholder="Your TCGPlayer API key"
          helpText="Used for Pokémon and MTG card pricing"
        />
      </div>

      {/* eBay */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-white font-semibold">eBay Developer API</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Create an app at{' '}
              <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                developer.ebay.com
              </a>
            </p>
          </div>
          {/* Connection status */}
          {ebayStatus?.connected ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-emerald-400 text-xs">Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-700 border border-slate-600 rounded-lg">
              <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
              <span className="text-slate-400 text-xs">Not connected</span>
            </div>
          )}
        </div>

        <SettingField
          label="eBay Client ID (App ID)"
          fieldKey="ebay_client_id"
          value={form.ebay_client_id}
          onChange={handleChange}
          placeholder="Your eBay Client ID"
        />
        <SettingField
          label="eBay Client Secret"
          fieldKey="ebay_client_secret"
          value={form.ebay_client_secret}
          onChange={handleChange}
          masked
          placeholder="Your eBay Client Secret"
        />
        <SettingField
          label="eBay Redirect URI"
          fieldKey="ebay_redirect_uri"
          value={form.ebay_redirect_uri}
          onChange={handleChange}
          placeholder="http://localhost:3001/api/ebay/callback"
        />

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">eBay Environment</label>
          <div className="flex gap-3">
            {['sandbox', 'production'].map(env => (
              <label key={env} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="ebay_env"
                  value={env}
                  checked={(form.ebay_env || 'sandbox') === env}
                  onChange={() => handleChange('ebay_env', env)}
                  className="text-indigo-600"
                />
                <span className="text-sm text-slate-300 capitalize">{env}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Use Sandbox for testing, Production for real listings</p>
        </div>

        {/* eBay Listing Policy IDs (advanced) */}
        <details className="group">
          <summary className="text-sm text-slate-400 cursor-pointer hover:text-white">
            Advanced: eBay Policy IDs (required for listings)
          </summary>
          <div className="mt-3 space-y-3">
            <SettingField
              label="Fulfillment Policy ID"
              fieldKey="ebay_fulfillment_policy_id"
              value={form.ebay_fulfillment_policy_id}
              onChange={handleChange}
              placeholder="From eBay Seller Hub"
            />
            <SettingField
              label="Payment Policy ID"
              fieldKey="ebay_payment_policy_id"
              value={form.ebay_payment_policy_id}
              onChange={handleChange}
              placeholder="From eBay Seller Hub"
            />
            <SettingField
              label="Return Policy ID"
              fieldKey="ebay_return_policy_id"
              value={form.ebay_return_policy_id}
              onChange={handleChange}
              placeholder="From eBay Seller Hub"
            />
          </div>
        </details>

        {/* Connect button */}
        <button
          onClick={handleConnectEbay}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <LinkIcon className="w-4 h-4" />
          {ebayStatus?.connected ? 'Reconnect eBay Account' : 'Connect eBay Account'}
        </button>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-emerald-400 text-sm">✓ Saved successfully</span>}
        <button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
