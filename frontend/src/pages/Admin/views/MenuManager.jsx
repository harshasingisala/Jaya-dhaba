import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Image as ImageIcon, ToggleLeft, ToggleRight, DollarSign, Info, Loader2, Zap, Sparkles, X, Save } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import api from '../../../api';
import { usePollingFallback } from '../../../hooks/usePollingFallback';

export default function MenuManager() {
  const { restaurantId, vibrate } = useApp();
  const [menu, setMenu] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [categories, setCategories] = useState(['All']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = 'Menu — Jaya Dhaba Admin';
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    fetchMenu();
  }, [restaurantId]);

  useEffect(() => {
    const handler = (event) => {
      const { action, item_id, item } = event.detail || {};
      if (action === 'created' && item) {
        setMenu((prev) => [...prev.filter((menuItem) => menuItem.id !== item.id), item]);
      } else if (action === 'updated' && item) {
        setMenu((prev) => prev.map((menuItem) => menuItem.id === item_id ? item : menuItem));
      } else if (action === 'deleted') {
        setMenu((prev) => prev.filter((menuItem) => menuItem.id !== item_id));
      }
    };
    window.addEventListener('rt:menu', handler);
    return () => window.removeEventListener('rt:menu', handler);
  }, []);

  usePollingFallback(fetchMenu, 10000);

  async function fetchMenu() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAdminMenu();
      const items = Array.isArray(data) ? data : data?.items || [];
      setMenu(items);
      const uniqueCats = ['All', ...new Set(items.map(item => item.category))];
      setCategories(uniqueCats);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('Failed to retrieve the culinary vault. Please check the backend connection.');
    } finally {
      setIsLoading(false);
    }
  }
  const handleDelete = async (item) => {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return;
    try {
      await api.deleteMenuItem(item.id);
      await fetchMenu();
    } catch (err) {
      setError('Failed to delete item. Please try again.');
    }
  };

  async function toggleAvailability(id, currentAvailability) {
    if (vibrate) vibrate(20);
    try {
      const data = await api.updateMenuItem(id, { available: !currentAvailability });
      setMenu(prev => prev.map(item =>
        item.id === id ? data : item
      ));
      await fetchMenu();
    } catch (err) {
      setError('Failed to update item availability. Please try again.');
    }
  }

  const filteredMenu = menu.filter(item =>
    activeCategory === 'All' || item.category === activeCategory
  );

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

      <MenuItemModal
        isModalOpen={isModalOpen}
        setIsModalOpen={setIsModalOpen}
        editingItem={editingItem}
        restaurantId={restaurantId}
        onSaved={(savedItem, isEdit) => {
          setMenu(prev =>
            isEdit
              ? prev.map(i => i.id === savedItem.id ? savedItem : i)
              : [savedItem, ...prev]
          );
          setIsModalOpen(false);
          if (savedItem.category && !categories.includes(savedItem.category)) {
            setCategories(prev => [...prev, savedItem.category]);
          }
          fetchMenu();
        }}
      />

      {/* HEADER & NEW ITEM */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div className="space-y-6">
          <h2 className="text-4xl font-serif italic text-heritage-espresso leading-none">Menu Management</h2>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Curating the Jaya Dhaba Culinary Vault</p>
        </div>
        <div className="flex gap-4">
          <button className="bg-heritage-espresso/5 text-heritage-espresso/40 px-8 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.4em] hover:bg-red-50 hover:text-red-500 transition-all flex items-center gap-4">
            <Zap size={16} />
            86 Mode
          </button>
          <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="bg-heritage-gold text-white px-10 py-4 rounded-full text-[10px] font-black uppercase tracking-[0.4em] shadow-xl hover:bg-heritage-espresso transition-all flex items-center gap-4 group">
            <Plus size={16} className="group-hover:rotate-90 transition-transform" />
            Add New Item
          </button>
        </div>
      </div>

      {/* CATEGORY TABS */}
      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 border-b border-heritage-espresso/5">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${activeCategory === cat ? 'bg-heritage-espresso text-white border-heritage-espresso shadow-lg' : 'border-heritage-espresso/10 text-heritage-espresso/30 hover:text-heritage-espresso'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* MENU TABLE */}
      <div className="bg-white/40 backdrop-blur-md rounded-[3rem] border border-heritage-espresso/5 shadow-2xl overflow-x-auto min-h-[500px]">
        <table className="w-full min-w-[860px] text-left border-collapse">
          <thead>
            <tr className="bg-heritage-stone/30 border-b border-heritage-espresso/5">
              <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Culinary Item</th>
              <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Category</th>
              <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Price</th>
              <th className="px-10 py-8 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Status</th>
              <th className="px-10 py-8 text-right pr-12 text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-heritage-espresso/5">
            {isLoading ? (
              <tr>
                <td colSpan="5" className="py-40 text-center">
                  <Loader2 className="animate-spin inline-block text-heritage-espresso/20" size={40} />
                  <p className="mt-4 text-heritage-espresso/20 font-serif italic text-xl">Calling the culinary vault...</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="5" className="py-40 text-center">
                  <div className="flex flex-col items-center gap-6 max-w-md mx-auto">
                    <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                      <Info size={32} />
                    </div>
                    <p className="text-xl font-serif italic text-red-900/60 leading-relaxed">{error}</p>
                    <button
                      onClick={fetchMenu}
                      className="px-10 py-4 bg-red-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-xl shadow-red-200"
                    >
                      Retry Connection
                    </button>
                  </div>
                </td>
              </tr>
            ) : filteredMenu.length === 0 ? (
              <tr>
                <td colSpan="5" className="py-24 text-center text-heritage-espresso/25">
                  <ImageIcon className="mx-auto mb-4" size={42} />
                  <p className="font-serif italic text-2xl">No items in this category yet</p>
                </td>
              </tr>
            ) : filteredMenu.map((item) => (
              <tr key={item.id} className={`group hover:bg-white/40 transition-all duration-300 ${item.available === false ? 'opacity-55 grayscale' : ''}`}>
                <td className="px-10 py-8">
                  <div className="flex items-center gap-8">
                    <div className="w-20 h-20 rounded-2xl bg-heritage-stone overflow-hidden border-2 border-white shadow-lg relative shrink-0">
                      <img
                        src={item.image || item.img || '/biryani.png'}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        alt={item.name}
                        onError={(e) => { e.target.src = '/biryani.png'; }}
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-serif italic text-heritage-espresso">{item.name}</h3>
                      {item.available === false && <span className="inline-flex mt-1 px-2 py-1 rounded-full bg-heritage-espresso/10 text-[8px] font-black uppercase tracking-widest text-heritage-espresso/50">Unavailable</span>}
                      <p className="text-[10px] text-heritage-espresso/40 italic line-clamp-1 max-w-[300px]">{item.description || item.desc}</p>
                    </div>
                  </div>
                </td>
                <td className="px-10 py-8">
                  <span className="text-[9px] font-black uppercase tracking-widest text-heritage-gold">{item.category}</span>
                </td>
                <td className="px-10 py-8">
                  <p className="text-2xl font-serif italic text-heritage-terracotta tracking-tighter">₹{item.price}</p>
                </td>
                <td className="px-10 py-8">
                  <button
                    onClick={() => toggleAvailability(item.id, item.is_available ?? item.available !== false)}
                    className={`flex items-center gap-3 group/toggle ${item.available !== false ? 'text-heritage-accent' : 'text-heritage-espresso/20'}`}
                  >
                    <span className="text-[9px] font-black uppercase tracking-widest">{item.available !== false ? 'Active' : 'Unavailable'}</span>
                    {item.available !== false ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </td>
                <td className="px-10 py-8 text-right pr-12">
                  <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                    <button onClick={() => { setEditingItem(item); setIsModalOpen(true); }} className="min-h-[44px] min-w-[44px] p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-heritage-espresso hover:shadow-lg transition-all">
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => alert("AI Heritage Model Initializing... Photo enhancement will be ready shortly.")}
                      className="min-h-[44px] min-w-[44px] p-3 bg-heritage-gold/10 rounded-2xl text-heritage-gold hover:bg-heritage-gold hover:text-white hover:shadow-lg transition-all"
                    >
                      <Sparkles size={16} />
                    </button>
                    <button onClick={() => handleDelete(item)} className="min-h-[44px] min-w-[44px] p-3 bg-heritage-stone rounded-2xl text-heritage-espresso/40 hover:text-red-500 hover:shadow-lg transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

const EMPTY_FORM = {
  name: '',
  price: '',
  category: '',
  description: '',
  image_url: '',
  is_available: true,
};

export function MenuItemModal({ isModalOpen, setIsModalOpen, editingItem, restaurantId, onSaved }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Pre-fill when editing
  useEffect(() => {
    if (editingItem) {
      const imageUrl = editingItem.image_url || editingItem.img || '';
      setForm({
        name: editingItem.name || '',
        price: editingItem.price?.toString() || '',
        category: editingItem.category || '',
        description: editingItem.description || '',
        image_url: String(imageUrl).startsWith('http') ? imageUrl : '',
        is_available: editingItem.is_available ?? editingItem.available ?? true,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [editingItem, isModalOpen]);

  const handleChange = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setError(null);
    if (form.name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) { setError('Price must be a positive number.'); return; }
    if (!form.category.trim()) { setError('Category is required.'); return; }
    if (form.image_url.trim() && !form.image_url.trim().startsWith('http')) { setError('Image URL must start with http.'); return; }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price_full: parseFloat(form.price),
        category: form.category.trim(),
        description: form.description.trim(),
        image_url: form.image_url.trim(),
        is_available: form.is_available,
      };

      let saved;
      if (editingItem?.id) {
        saved = await api.updateMenuItem(editingItem.id, payload);
      } else {
        saved = await api.addMenuItem(payload);
      }

      onSaved(saved, !!editingItem?.id);
    } catch (err) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white p-8 md:p-10 rounded-[3rem] w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in duration-300">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-3xl font-serif italic text-heritage-espresso">
              {editingItem ? 'Edit Item' : 'New Item'}
            </h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/40 mt-1">
              {editingItem ? `Editing · ${editingItem.name}` : 'Add to your menu'}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(false)}
            className="min-h-[44px] min-w-[44px] p-2 rounded-full hover:bg-heritage-stone/40 transition-colors"
          >
            <X size={18} className="text-heritage-espresso/40" />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
              Item Name *
            </label>
            <input
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="min-h-[44px] w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25"
              placeholder="e.g. Dum Biryani"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
                Price (₹) *
              </label>
              <input
                type="number"
                value={form.price}
                onChange={(e) => handleChange('price', e.target.value)}
                className="min-h-[44px] w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25"
                placeholder="350"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
                Category
              </label>
              <input
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="min-h-[44px] w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25"
                placeholder="Mains"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              className="w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25 resize-none"
              placeholder="Short description for the menu..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-heritage-espresso/50 mb-1.5">
              Image URL
            </label>
            <input
              value={form.image_url}
              onChange={(e) => handleChange('image_url', e.target.value)}
              className="min-h-[44px] w-full bg-heritage-stone/30 border border-heritage-espresso/10 px-5 py-3.5 rounded-2xl text-sm outline-none focus:border-heritage-gold transition-colors placeholder:text-heritage-espresso/25"
              placeholder="https://example.com/biryani.jpg"
            />
            {form.image_url.trim().startsWith('http') && (
              <img
                src={form.image_url.trim()}
                alt="Preview"
                className="mt-3 h-20 w-20 rounded-2xl object-cover border border-heritage-espresso/10"
                onError={(event) => { event.currentTarget.style.display = 'none'; }}
              />
            )}
          </div>

          {/* Available toggle */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-heritage-stone/30 rounded-2xl">
            <span className="text-[11px] font-black uppercase tracking-widest text-heritage-espresso/60">
              Available Today
            </span>
            <button
              onClick={() => handleChange('is_available', !form.is_available)}
              className={`relative min-h-[44px] min-w-[44px] w-11 h-6 rounded-full transition-colors duration-200 ${form.is_available ? 'bg-heritage-gold' : 'bg-heritage-espresso/20'
                }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${form.is_available ? 'translate-x-5' : 'translate-x-0'
                  }`}
              />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-[11px] text-red-500 font-medium mb-4 px-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(false)}
            className="min-h-[44px] flex-1 py-4 bg-heritage-stone/30 text-heritage-espresso rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-stone/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="min-h-[44px] flex-1 py-4 bg-heritage-espresso text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-heritage-gold transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <Save size={13} />
                {editingItem ? 'Save Changes' : 'Add Item'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
