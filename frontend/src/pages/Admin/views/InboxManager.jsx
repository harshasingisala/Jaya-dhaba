import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import api from '../../../api';

function timeAgo(value) {
  if (!value) return 'Just now';
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return 'Just now';
  const seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isUnread(submission) {
  return submission?.is_read === false || submission?.is_read === 0 || submission?.is_read === '0';
}

export default function InboxManager() {
  const [submissions, setSubmissions] = useState([]);
  const [unread, setUnread] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const sortedSubmissions = useMemo(() => submissions || [], [submissions]);

  async function loadSubmissions() {
    setLoading(true);
    setError('');
    try {
      const payload = await api.getContactSubmissions();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      setSubmissions(rows);
      setUnread(Number(payload?.unread || rows.filter(isUnread).length || 0));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load contact submissions', err);
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = 'Inbox \u2014 Jaya Dhaba Admin';
    loadSubmissions();
  }, []);

  useEffect(() => {
    const handler = () => loadSubmissions();
    window.addEventListener('rt:contact', handler);
    return () => window.removeEventListener('rt:contact', handler);
  }, []);

  const openSubmission = async (submission) => {
    setExpandedId((current) => (current === submission.id ? null : submission.id));
    if (!isUnread(submission)) return;
    setSubmissions((prev) => prev.map((item) => (
      item.id === submission.id ? { ...item, is_read: true } : item
    )));
    setUnread((count) => Math.max(0, count - 1));
    try {
      await api.markSubmissionRead(submission.id);
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setSubmissions((prev) => prev.map((item) => (
        item.id === submission.id ? { ...item, is_read: false } : item
      )));
      setUnread((count) => count + 1);
    }
  };

  const deleteSubmission = async (submission) => {
    if (!window.confirm(`Delete inquiry from ${submission.name || 'Guest'}?`)) return;
    setBusyId(submission.id);
    try {
      await api.deleteSubmission(submission.id);
      setSubmissions((prev) => prev.filter((item) => item.id !== submission.id));
      if (isUnread(submission)) setUnread((count) => Math.max(0, count - 1));
    } catch (err) {
      if (import.meta.env.DEV) console.error(err);
      setError('Delete failed. Please retry.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-serif italic text-heritage-espresso">Inbox</h2>
            <span className="min-h-[32px] px-4 inline-flex items-center rounded-full bg-heritage-gold/15 text-heritage-espresso text-[10px] font-black uppercase tracking-widest border border-heritage-gold/30">
              {unread} unread
            </span>
          </div>
          <p className="text-xs font-bold text-heritage-espresso/40 mt-2 uppercase tracking-[0.25em]">
            Guest inquiries from the contact form
          </p>
        </div>
        <button
          onClick={loadSubmissions}
          className="min-h-[44px] px-6 py-3 rounded-2xl bg-white border border-heritage-espresso/10 text-heritage-espresso/60 hover:text-heritage-espresso hover:shadow-xl transition-all flex items-center gap-3 text-[10px] font-black uppercase tracking-widest"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-[3rem] border border-heritage-espresso/5 shadow-xl min-h-[520px] p-4 md:p-8">
        {loading ? (
          <div className="h-[420px] flex flex-col items-center justify-center text-heritage-espresso/30">
            <Loader2 className="animate-spin mb-5" size={42} />
            <p className="text-xl font-serif italic">Loading inquiries...</p>
          </div>
        ) : error ? (
          <div className="h-[420px] flex flex-col items-center justify-center text-center gap-6">
            <div className="w-20 h-20 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <AlertCircle size={34} />
            </div>
            <p className="text-xl font-serif italic text-red-900/70">Failed to load inquiries: {error}</p>
            <button
              onClick={loadSubmissions}
              className="min-h-[44px] px-8 py-3 rounded-full bg-red-600 text-white text-[10px] font-black uppercase tracking-widest"
            >
              Retry
            </button>
          </div>
        ) : sortedSubmissions.length === 0 ? (
          <div className="h-[420px] flex flex-col items-center justify-center text-heritage-espresso/25">
            <Mail size={48} className="mb-5" />
            <p className="text-2xl font-serif italic">{'No inquiries yet \u{1F4ED}'}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedSubmissions.map((submission) => {
              const unreadSubmission = isUnread(submission);
              const expanded = expandedId === submission.id;
              return (
                <article
                  key={submission.id}
                  className={`rounded-[2rem] border p-5 md:p-7 transition-all ${
                    unreadSubmission
                      ? 'border-heritage-gold bg-heritage-gold/5 shadow-lg'
                      : 'border-heritage-espresso/5 bg-heritage-stone/20'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                    <button
                      onClick={() => openSubmission(submission)}
                      className="flex-1 text-left min-h-[44px]"
                    >
                      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                        <h3 className={`text-xl font-serif italic text-heritage-espresso ${unreadSubmission ? 'font-black' : ''}`}>
                          {submission.name || 'Guest'}
                        </h3>
                        <span className="text-[10px] font-black uppercase tracking-widest text-heritage-espresso/35">
                          {timeAgo(submission.created_at)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-heritage-espresso/50">
                        <span>{submission.email || 'No email'}</span>
                        <span>{submission.phone || 'No phone'}</span>
                        <span>{submission.subject || 'General inquiry'}</span>
                      </div>
                      <p className="mt-4 text-sm leading-relaxed text-heritage-espresso/65 line-clamp-2">
                        {submission.message || ''}
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openSubmission(submission)}
                        className="min-h-[44px] min-w-[44px] rounded-2xl bg-white text-heritage-espresso/40 hover:text-heritage-gold border border-heritage-espresso/5 flex items-center justify-center"
                        title="Expand inquiry"
                      >
                        <ChevronDown size={18} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </button>
                      <button
                        disabled={busyId === submission.id}
                        onClick={() => deleteSubmission(submission)}
                        className="min-h-[44px] min-w-[44px] rounded-2xl bg-white text-heritage-espresso/40 hover:text-red-600 border border-heritage-espresso/5 flex items-center justify-center disabled:opacity-50"
                        title="Delete inquiry"
                      >
                        {busyId === submission.id ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-6 rounded-2xl bg-white/75 border border-heritage-espresso/5 p-5 text-sm text-heritage-espresso/70 leading-relaxed">
                      <div className="grid md:grid-cols-2 gap-3 mb-5 text-xs">
                        <p><b>Name:</b> {submission.name || 'Guest'}</p>
                        <p><b>Email:</b> {submission.email || 'No email'}</p>
                        <p><b>Phone:</b> {submission.phone || 'No phone'}</p>
                        <p><b>Subject:</b> {submission.subject || 'General inquiry'}</p>
                      </div>
                      <p className="whitespace-pre-wrap">{submission.message}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
