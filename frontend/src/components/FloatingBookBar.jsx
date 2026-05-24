import { useNavigate } from 'react-router-dom';
import MagneticButton from './MagneticButton';

export default function FloatingBookBar() {
  const navigate = useNavigate();

  return (
    <div className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-1rem)] max-w-sm z-[90] floating-book-bar">
       <MagneticButton 
         onClick={() => navigate('/reservation')}
         className="w-full bg-[#C05621] text-[#FAF9F6] py-4 rounded-[1.35rem] shadow-2xl font-black text-[11px] uppercase tracking-[0.22em] font-sans border-2 border-white/20 backdrop-blur-md"
       >
         Book Table
       </MagneticButton>
    </div>
  );
}
