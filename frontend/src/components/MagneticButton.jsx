import { motion } from 'framer-motion'
import { useMagnetic } from '../hooks/useMagnetic'
import useRipple from '../hooks/useRipple'

export default function MagneticButton({ children, className, onClick, type = 'button', disabled = false, ...props }) {
  const { ref, position, handleMouseMove, reset } = useMagnetic()
  const createRipple = useRipple()

  return (
    <motion.button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
      className={className}
      onClick={(e) => {
        if (disabled) return
        createRipple(e)
        onClick?.(e)
      }}
    >
      {children}
    </motion.button>
  )
}
