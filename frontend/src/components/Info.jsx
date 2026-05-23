export default function Info() {
  return (
    <section id="info" className="py-32 px-10 md:px-20 text-center relative bg-transparent">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-baseline gap-6 mb-16 px-2">
           <h2 className="text-5xl md:text-6xl font-serif italic text-heritage-espresso leading-none">Visit Us</h2>
           <div className="flex-1 h-px bg-heritage-espresso/10 hidden md:block" />
           <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30">The Secunderabad Space</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start text-left">
           <div className="lg:col-span-5 space-y-12 bg-white/40 backdrop-blur-xl p-12 rounded-[4rem] border border-heritage-espresso/5 shadow-xl">
              <div className="space-y-8">
                 <div className="group">
                   <h4 className="text-heritage-espresso/30 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Master Address</h4>
                   <p className="text-xl font-serif italic text-heritage-espresso">East Marredpally, Secunderabad,<br/>Telangana 500026</p>
                 </div>
                 <div className="group">
                   <h4 className="text-heritage-espresso/30 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Direct Communication</h4>
                   <p className="text-lg font-bold text-heritage-espresso">+91 73861 85821</p>
                   <p className="text-sm font-medium text-heritage-espresso/40 italic mt-1">owner@jayadhaba.com</p>
                 </div>
                 <div className="group">
                   <h4 className="text-heritage-espresso/30 text-[10px] font-black uppercase tracking-[0.4em] mb-4">Kitchen Traditions</h4>
                   <p className="text-lg font-bold text-heritage-espresso">Open Daily</p>
                   <p className="text-sm font-medium text-heritage-espresso/40 italic font-serif mt-1">11:00 AM – 11:30 PM (Noon - Midnight Weekends)</p>
                 </div>
              </div>
           </div>
           
           <div className="lg:col-span-7 bg-white/40 backdrop-blur-xl p-4 rounded-[4.5rem] border border-heritage-espresso/5 shadow-2xl overflow-hidden group">
              <a
                href="https://share.google/6efBsQaOasTY9Tnvt"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-[500px] rounded-[3.5rem] bg-heritage-espresso text-white flex flex-col items-center justify-center gap-6 text-center px-8 hover:bg-heritage-gold transition-all duration-500"
              >
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-white/60">Open Google Maps</span>
                <span className="text-4xl md:text-5xl font-serif italic">Heritage Exclusive Since 2020</span>
              </a>
           </div>
        </div>
      </div>
    </section>
  );
}
