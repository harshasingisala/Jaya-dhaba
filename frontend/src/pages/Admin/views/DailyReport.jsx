import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Download, Loader2, Star, TrendingDown, Trophy, Wallet, Clock3 } from 'lucide-react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import api from '../../../api';
import { useToast } from '../../../context/ToastContext';

const GOLD = '#C9A84C';
const BG = '#111111';
const FOOD = '#C9A84C';
const BEVERAGE = '#38A169';
const OTHER = '#3182CE';
const PDF_LIBS = {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};

function todayIso() {
  return new Date(Date.now() + (5.5 * 60 * 60 * 1000)).toISOString().split('T')[0];
}

function amount(value) {
  return `₹ ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function count(value) {
  return Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function safeRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.concat(Array(Math.max(0, 5 - list.length)).fill(null)).slice(0, 5);
}

export default function DailyReport() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('daily');
  const [date, setDate] = useState(todayIso());
  const [report, setReport] = useState(null);
  const [periodReport, setPeriodReport] = useState({ weekly: [], monthly: [], payment_summary: [], top_items: [] });
  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    document.title = 'Reports — Jaya Dhaba Admin';
  }, []);

  useEffect(() => {
    if (activeTab === 'daily') fetchReport(date);
  }, [activeTab, date]);

  useEffect(() => {
    if (activeTab === 'daily') return;
    fetchPeriodReport();
  }, [activeTab]);

  async function fetchReport(targetDate = date) {
    setLoading(true);
    setError('');
    try {
      setReport(await api.getDailyReport(targetDate));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Daily report failed', err);
      const status = import.meta.env.DEV && err?.status ? ` (${err.status})` : '';
      setError(`Failed to generate report${status}.`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPeriodReport() {
    setPeriodLoading(true);
    setError('');
    try {
      const data = await api.getRevenue();
      setPeriodReport({
        weekly: Array.isArray(data?.weekly) ? data.weekly : [],
        monthly: Array.isArray(data?.monthly) ? data.monthly : [],
        payment_summary: Array.isArray(data?.payment_summary) ? data.payment_summary : [],
        top_items: Array.isArray(data?.top_items) ? data.top_items : [],
      });
    } catch (err) {
      if (import.meta.env.DEV) console.error('Period report failed', err);
      setError('Failed to load report.');
    } finally {
      setPeriodLoading(false);
    }
  }

  async function exportPdf() {
    if (!report) return;
    setPdfLoading(true);
    try {
      const [html2canvasLib, jsPDFLib] = await Promise.all([
        import(/* @vite-ignore */ PDF_LIBS.html2canvas),
        import(/* @vite-ignore */ PDF_LIBS.jspdf),
      ]).then(() => [window.html2canvas, window.jspdf?.jsPDF]).catch(() => loadScriptsSequentially());
      const html2canvas = html2canvasLib?.default || html2canvasLib || window.html2canvas;
      const jsPDF = jsPDFLib?.jsPDF || jsPDFLib?.default || jsPDFLib || window.jspdf?.jsPDF;
      if (!html2canvas || !jsPDF) throw new Error('PDF tools unavailable');
      const element = document.getElementById('daily-report-container');
      if (!element) throw new Error('daily-report-container not found');
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: BG });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let remaining = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
      remaining -= pageHeight;
      while (remaining > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
        remaining -= pageHeight;
      }
      pdf.save(`JayaDhaba_Report_${report.date}.pdf`);
    } catch (e) {
      showToast('PDF export failed. Try again.', 'error');
      console.error('Export error:', e);
    } finally {
      setPdfLoading(false);
    }
  }

  const categoryData = useMemo(() => {
    const source = report?.sales_by_category || {};
    return [
      { name: 'Food', value: Number(source.food?.amount || 0), color: FOOD },
      { name: 'Beverage', value: Number(source.beverage?.amount || 0), color: BEVERAGE },
      { name: 'Other', value: Number(source.other?.amount || 0), color: OTHER },
    ];
  }, [report]);

  if (activeTab !== 'daily') {
    const rows = periodReport[activeTab] || [];
    const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
    const totalRevenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
    const avgBill = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const trendRows = rows.slice().reverse();
    const paymentRows = periodReport.payment_summary || [];
    const topItems = periodReport.top_items || [];
    return (
      <div className="min-h-[70vh] rounded-[2rem] bg-[#111111] text-white p-8">
        <ReportTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        {periodLoading ? (
          <div className="h-[50vh] grid place-items-center text-center">
            <Loader2 className="animate-spin text-[#C9A84C]" size={52} />
          </div>
        ) : error ? (
          <div className="h-[50vh] grid place-items-center text-center">
            <div>
              <p className="text-2xl font-serif italic text-red-300">{error}</p>
              <button onClick={fetchPeriodReport} className="mt-5 min-h-[44px] rounded-xl bg-[#C9A84C] px-6 font-black uppercase text-black">
                Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="grid md:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Report Type</p>
                <p className="mt-3 text-2xl font-serif italic text-[#C9A84C]">{activeTab === 'weekly' ? 'Weekly' : 'Monthly'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Total Orders</p>
                <p className="mt-3 text-2xl font-serif italic text-[#C9A84C]">{count(totalOrders)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Total Revenue</p>
                <p className="mt-3 text-2xl font-serif italic text-[#C9A84C]">{amount(totalRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Avg Bill Value</p>
                <p className="mt-3 text-2xl font-serif italic text-[#C9A84C]">{amount(avgBill)}</p>
              </div>
            </section>
            <section className="grid xl:grid-cols-2 gap-5">
              <Panel title={`${activeTab === 'weekly' ? 'Weekly' : 'Monthly'} Sales Trend`}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendRows}>
                      <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="#8b8b8b" />
                      <YAxis stroke="#8b8b8b" tickFormatter={(value) => `Rs ${value}`} />
                      <Tooltip formatter={(value) => amount(value)} contentStyle={{ background: '#1b1b1b', border: '1px solid #C9A84C', color: '#fff' }} />
                      <Line type="monotone" dataKey="revenue" stroke="#C9A84C" strokeWidth={3} dot={{ fill: '#C9A84C' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Panel>
              <Panel title="Payment Split">
                <InfoTable goldLast rows={[
                  ...paymentRows.map((row) => [
                    `${String(row.method || 'other').toUpperCase()} (${count(row.orders)} orders)`,
                    amount(row.revenue),
                  ]),
                  ['TOTAL COLLECTION', amount(totalRevenue)],
                ]} />
              </Panel>
            </section>
            <Panel title="Top Selling Items">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/35">
                    <th className="py-3">Item</th>
                    <th className="py-3 text-right">Qty</th>
                    <th className="py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topItems.length === 0 ? (
                    <tr className="border-t border-white/10">
                      <td className="py-6 text-white/55" colSpan={3}>No item sales found yet.</td>
                    </tr>
                  ) : topItems.map((item, index) => (
                    <tr key={`${item.name}-${index}`} className="border-t border-white/10">
                      <td className="py-4 text-white/80">{index + 1}. {item.name}</td>
                      <td className="py-4 text-right text-white/70">{count(item.qty)}</td>
                      <td className="py-4 text-right text-[#C9A84C]">{amount(item.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title={`${activeTab === 'weekly' ? 'Weekly' : 'Monthly'} Orders`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/35">
                    <th className="py-3">Period</th>
                    <th className="py-3 text-right">Orders</th>
                    <th className="py-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="border-t border-white/10">
                      <td className="py-6 text-white/55" colSpan={3}>No orders found yet.</td>
                    </tr>
                  ) : rows.map((row) => (
                    <tr key={row.label} className="border-t border-white/10">
                      <td className="py-4 text-white/80">{row.label}</td>
                      <td className="py-4 text-right text-white/70">{count(row.orders)}</td>
                      <td className="py-4 text-right text-[#C9A84C]">{amount(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] bg-[#111111] text-white overflow-hidden shadow-2xl">
      <div className="p-5 md:p-8 border-b border-white/10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <ReportTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="min-h-[44px] rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white"
          />
          <button onClick={() => fetchReport()} className="min-h-[44px] rounded-xl bg-[#C9A84C] px-5 text-sm font-black uppercase text-black">
            Generate Report
          </button>
          <button
            onClick={exportPdf}
            disabled={!report || pdfLoading}
            className="min-h-[44px] rounded-xl border border-[#C9A84C]/50 px-5 text-sm font-black uppercase text-[#C9A84C] disabled:opacity-40 inline-flex items-center gap-2"
          >
            <Download size={16} />
            {pdfLoading ? 'Generating PDF...' : 'Export PDF ↓'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[70vh] grid place-items-center">
          <Loader2 className="animate-spin text-[#C9A84C]" size={52} />
        </div>
      ) : error ? (
        <div className="min-h-[70vh] grid place-items-center text-center">
          <div>
            <p className="text-2xl font-serif italic text-red-300">{error}</p>
            <button onClick={() => fetchReport()} className="mt-5 min-h-[44px] rounded-xl bg-[#C9A84C] px-6 font-black uppercase text-black">
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div id="daily-report-container" className="bg-[#111111] p-5 md:p-8 space-y-8">
          <Header report={report} />
          <StatsBar summary={report?.summary || {}} />
          <section className="grid xl:grid-cols-3 gap-5">
            <Panel title="Sales Overview">
              <OverviewRows report={report} />
            </Panel>
            <Panel title="Sales by Category">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3}>
                      {categoryData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => amount(value)} contentStyle={{ background: '#1b1b1b', border: '1px solid #C9A84C', color: '#fff' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Peak Sales">
              <div className="h-full flex flex-col justify-center items-center text-center gap-4">
                <Clock3 className="text-[#C9A84C]" size={42} />
                <p className="text-4xl font-serif italic text-[#C9A84C]">{report?.peak_sales?.peak_time || '12:00 AM'}</p>
                <p>Sales: <b>{amount(report?.peak_sales?.peak_amount)}</b></p>
                <p>Percentage: <b>{pct(report?.peak_sales?.peak_percentage)}</b></p>
              </div>
            </Panel>
          </section>

          <section className="grid xl:grid-cols-3 gap-5">
            <ItemTable title="Most Selling Items" icon={<Trophy size={18} />} rows={report?.top_items?.most_selling} />
            <ItemTable title="Mid Range Items" icon={<Star size={18} />} rows={report?.top_items?.mid_range} />
            <ItemTable title="Least Selling Items" icon={<TrendingDown size={18} />} rows={report?.top_items?.least_selling} />
          </section>

          <section className="grid xl:grid-cols-2 gap-5">
            <Panel title="Sales Trend">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report?.sales_trend || []}>
                    <CartesianGrid stroke="#2a2a2a" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#8b8b8b" />
                    <YAxis stroke="#8b8b8b" tickFormatter={(value) => `₹${value}`} />
                    <Tooltip formatter={(value) => amount(value)} contentStyle={{ background: '#1b1b1b', border: '1px solid #C9A84C', color: '#fff' }} />
                    <Line type="monotone" dataKey="amount" stroke="#C9A84C" strokeWidth={3} dot={{ fill: '#C9A84C' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Peak Sales Analysis">
              <InfoTable rows={[
                ['PEAK TIME', report?.peak_sales?.peak_time || '12:00 AM'],
                ['SALES AMOUNT', amount(report?.peak_sales?.peak_amount)],
                ['PEAK SALES %', pct(report?.peak_sales?.peak_percentage)],
                ['LOWEST TIME', report?.peak_sales?.lowest_time || '12:00 AM'],
                ['LOWEST SALES', amount(report?.peak_sales?.lowest_amount)],
                ['LOWEST SALES %', pct(report?.peak_sales?.lowest_percentage)],
              ]} />
            </Panel>
          </section>

          <section className="grid xl:grid-cols-3 gap-5">
            <Panel title="Payment Summary">
              <InfoTable goldLast rows={[
                [<><Wallet size={15} /> CASH</>, amount(report?.payment_summary?.cash)],
                ['UPI', amount(report?.payment_summary?.upi)],
                [<><CreditCard size={15} /> CARD</>, amount(report?.payment_summary?.card)],
                ['OTHER', amount(report?.payment_summary?.other)],
                ['TOTAL COLLECTION', amount(report?.payment_summary?.total_collection)],
              ]} />
            </Panel>
            <Panel title="Sales Summary">
              <InfoTable goldLast rows={[
                ['TOTAL SALES', amount(report?.sales_summary?.total_sales)],
                ['TOTAL DISCOUNT', amount(report?.sales_summary?.total_discount)],
                ['TAX AMOUNT', amount(report?.sales_summary?.tax_amount)],
                ['ROUND OFF', amount(report?.sales_summary?.round_off)],
                ['NET SALES', amount(report?.sales_summary?.net_sales)],
              ]} />
            </Panel>
            <Panel title="Additional Summary">
              <InfoTable goldLast rows={[
                ['RETURN/REFUND', amount(report?.additional_summary?.return_refund)],
                ['CANCELLED BILLS', count(report?.additional_summary?.cancelled_bills)],
                ['VOID ITEMS', count(report?.additional_summary?.void_items)],
                ['WASTAGE', amount(report?.additional_summary?.wastage)],
                ['NET PROFIT', amount(report?.additional_summary?.net_profit)],
              ]} />
            </Panel>
          </section>

          <section className="rounded-2xl border border-[#C9A84C] bg-black/30 p-6">
            <h3 className="text-xl font-serif italic text-[#C9A84C]">✦ AI Business Insight</h3>
            <p className="mt-3 italic text-white/75 leading-relaxed">{report?.ai_summary || 'Generating AI insight...'}</p>
          </section>

          <footer className="py-8 text-center text-3xl font-serif italic text-[#C9A84C]">
            Thank You For Your Support ♡
          </footer>
        </div>
      )}
    </div>
  );
}

function loadScript(id, src) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function loadScriptsSequentially() {
  await loadScript('daily-report-html2canvas', PDF_LIBS.html2canvas);
  await loadScript('daily-report-jspdf', PDF_LIBS.jspdf);
  return [window.html2canvas, window.jspdf?.jsPDF];
}

function ReportTabs({ activeTab, setActiveTab }) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ['daily', 'Daily Report'],
        ['weekly', 'Weekly Report'],
        ['monthly', 'Monthly Report'],
      ].map(([key, label]) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`min-h-[44px] rounded-xl px-5 text-xs font-black uppercase tracking-widest ${activeTab === key ? 'bg-[#C9A84C] text-black' : 'bg-white/5 text-white/55 border border-white/10'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Header({ report }) {
  return (
    <header className="flex flex-col md:flex-row md:items-start justify-between gap-5 border-b border-[#C9A84C]/35 pb-8">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full border border-[#C9A84C] grid place-items-center text-4xl font-serif italic text-[#C9A84C]">J</div>
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-white/45">Jaya Dhaba</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#C9A84C]">DAILY SALES REPORT</h1>
          <p className="mt-2 text-white/45">{report?.day || ''} · {report?.date || ''} · {report?.prepared_by || 'Jaya Dhaba Admin'}</p>
        </div>
      </div>
      <p className="text-xl font-serif italic text-[#C9A84C]">Good Food Good Mood</p>
    </header>
  );
}

function StatsBar({ summary }) {
  const cards = [
    ['Total Sales', amount(summary.total_sales)],
    ['Total Bills', count(summary.total_bills)],
    ['Total Customers', count(summary.total_customers)],
    ['Avg Bill Value', amount(summary.avg_bill_value)],
    ['Gross Profit', amount(summary.gross_profit)],
    ['Gross Profit %', pct(summary.gross_profit_pct)],
  ];
  return (
    <section className="grid md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
          <p className="mt-3 text-2xl font-serif italic text-[#C9A84C]">{value}</p>
        </div>
      ))}
    </section>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-lg font-black uppercase tracking-widest text-[#C9A84C]">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function OverviewRows({ report }) {
  const source = report?.sales_by_category || {};
  return (
    <InfoTable goldLast rows={[
      ['Food Sales', `${amount(source.food?.amount)}  ${pct(source.food?.percentage)}`],
      ['Beverage Sales', `${amount(source.beverage?.amount)}  ${pct(source.beverage?.percentage)}`],
      ['Other Sales', `${amount(source.other?.amount)}  ${pct(source.other?.percentage)}`],
      ['Total Sales', `${amount(source.total?.amount)}  ${pct(source.total?.percentage)}`],
    ]} />
  );
}

function ItemTable({ title, icon, rows }) {
  return (
    <Panel title={<span className="inline-flex items-center gap-2">{icon}{title}</span>}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-white/35">
            <th className="py-2">Rank/Item Name</th>
            <th className="py-2 text-right">QTY</th>
            <th className="py-2 text-right">Sales (₹)</th>
          </tr>
        </thead>
        <tbody>
          {safeRows(rows).map((item, index) => (
            <tr key={`${title}-${index}`} className="border-t border-white/10">
              <td className="py-3 text-white/80">{item ? `${index + 1}. ${item.name}` : '\u00A0'}</td>
              <td className="py-3 text-right text-white/70">{item ? count(item.qty_sold) : ''}</td>
              <td className="py-3 text-right text-[#C9A84C]">{item ? amount(item.revenue) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function InfoTable({ rows, goldLast = false }) {
  return (
    <div className="space-y-2">
      {rows.map(([label, value], index) => (
        <div key={index} className={`flex items-center justify-between gap-4 border-b border-white/10 py-3 ${goldLast && index === rows.length - 1 ? 'text-[#C9A84C] font-black' : 'text-white/75'}`}>
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest">{label}</span>
          <span className="text-right font-serif italic">{value}</span>
        </div>
      ))}
    </div>
  );
}
