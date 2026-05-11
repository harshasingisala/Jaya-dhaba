import { motion } from 'framer-motion'
import { useMagnetic } from '../hooks/useMagnetic'
import useRipple from '../hooks/useRipple'

export default function MagneticButton({ children, className, onClick }) {
  const { ref, position, handleMouseMove, reset } = useMagnetic()
  const createRipple = useRipple()

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
      className={className}
      onClick={(e) => { createRipple(e); onClick?.(e); }}
    >
      {children}
    </motion.button>
  )
}
