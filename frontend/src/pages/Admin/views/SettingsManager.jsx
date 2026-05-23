import { useState, useEffect } from 'react';
import api from '../../../api/index';
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useApp } from '../../../context/AppContext';

const DEFAULT_SETTINGS = {
  name: 'Jaya Dhaba',
  tagline: 'Heritage Restored. Flavor Perfected.',
  contact: '+917386185821',
  address: 'East Marredpally, Secunderabad, Telangana 500026',
  hours: '11:00 AM - 11:00 PM',
  upi_id: '',
  taxRate: 5,
  status: 'open',
  currency: 'INR',
};

// ─── HOOK: paste into your SettingsManager component ─────────────────────────
export function useSettings(restaurantId) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text: string }

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    api.getSettings(restaurantId)
      .then((data) => setSettings((prev) => ({ ...prev, ...data })))
      .catch((err) => {
        console.error('[JAYA_DEBUG] Caught error in useSettings getSettings:', err);
        /* defaults already set */
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const handleSave = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const taxRate = Number(settings.taxRate ?? settings.tax_rate ?? DEFAULT_SETTINGS.taxRate);
      await api.updateSettings(restaurantId, {
        name: String(settings.name || DEFAULT_SETTINGS.name).trim(),
        tagline: String(settings.tagline ?? DEFAULT_SETTINGS.tagline).trim(),
        hours: String(settings.hours || DEFAULT_SETTINGS.hours).trim(),
        contact: String(settings.contact || DEFAULT_SETTINGS.contact).trim(),
        status: settings.status || 'open',
        address: String(settings.address || DEFAULT_SETTINGS.address).trim(),
        taxRate: Number.isFinite(taxRate) ? taxRate : DEFAULT_SETTINGS.taxRate,
        currency: settings.currency || 'INR',
        upi_id: String(settings.upi_id || settings.upi || '').trim(),
      });
      setMsg({ type: 'success', text: 'Heritage settings updated successfully.' });
    } catch (err) {
      console.error('[JAYA_DEBUG] Caught error in handleSave:', err);
      setMsg({ type: 'error', text: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
      // Auto-clear success after 4s
      setTimeout(() => setMsg(null), 4000);
    }
  };

  return { settings, setSettings, loading, saving, msg, handleSave };
}


// ─── FULL STANDALONE SETTINGS PAGE ───────────────────────────────────────────
const FIELD_GROUPS = [
  {
    title: 'Restaurant Identity',
    fields: [
      { key: 'name', label: 'Restaurant Name',  placeholder: 'Heritage Kitchen',    type: 'text' },
      { key: 'tagline',         label: 'Tagline',           placeholder: 'Where tradition meets taste', type: 'text' },
    ],
  },
  {
    title: 'Contact & Location',
    fields: [
      { key: 'contact',   label: 'Phone Number', placeholder: '+91 98765 43210', type: 'tel' },
      { key: 'address', label: 'Address',       placeholder: '12 MG Road, Hyderabad', type: 'text' },
      { key: 'hours', label: 'Opening Hours', placeholder: 'Mon-Sun 11am-11pm', type: 'text' },
    ],
  },
  {
    title: 'Payments & Tax',
    fields: [
      { key: 'upi_id',   label: 'UPI ID',    placeholder: 'yourname@upi',   type: 'text' },
      { key: 'taxRate', label: 'Tax Rate %', placeholder: '5',              type: 'number' },
    ],
  },
];

export function SettingsPage() {
  const { restaurantId } = useApp();
  const { settings, setSettings, loading, saving, msg, handleSave } = useSettings(restaurantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={28} className="text-heritage-espresso/30 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-6 space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div>
        <h1 className="text-4xl font-serif italic text-heritage-espresso leading-none">Global Configurations</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20 mt-2">
          Managing the Core Identity & Operations
        </p>
      </div>

      {FIELD_GROUPS.map((group) => (
        <div
          key={group.title}
          className="bg-white rounded-[3rem] p-8 shadow-sm ring-1 ring-heritage-espresso/5"
        >
          <h3 className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 mb-6">
            {group.title}
          </h3>
          <div className="space-y-4">
            {group.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={settings[field.key] ?? ''}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                  className="w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25"
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Save */}
      <div className="flex items-center gap-4 pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-12 py-5 bg-heritage-espresso text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-all disabled:opacity-60 disabled:cursor-wait shadow-lg shadow-heritage-espresso/20"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          Save Configuration
        </button>

        {msg && (
          <div className={`flex items-center gap-2 text-[11px] font-black uppercase tracking-widest ${
            msg.type === 'success' ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {msg.type === 'success'
              ? <CheckCircle size={14} />
              : <AlertCircle size={14} />
            }
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
