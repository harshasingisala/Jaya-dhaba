import { useNavigate } from 'react-router-dom';
import MagneticButton from './MagneticButton';

export default function FloatingBookBar() {
  const navigate = useNavigate();

  return (
    <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-sm z-[90]">
       <MagneticButton 
         onClick={() => navigate('/reservation')}
         className="w-full bg-[#C05621] text-[#FAF9F6] py-5 rounded-full shadow-2xl font-black text-[12px] uppercase tracking-[0.3em] font-sans border-2 border-white/20 backdrop-blur-md"
       >
         Book Table
       </MagneticButton>
    </div>
  );
}
