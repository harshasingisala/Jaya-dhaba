import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

export default function Preloader() {
  if (import.meta.env.PROD) return null;
  const [progress, setProgress] = useState(0)
  const [isFinished, setIsFinished] = useState(false)

  useEffect(() => {
    // Fake progress since we removed heavy WebGL assets
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(interval)
          setTimeout(() => setIsFinished(true), 200)
          return 100
        }
        return p + Math.floor(Math.random() * 25) + 10
      })
    }, 60)

    return () => clearInterval(interval)
  }, [])

  return (
    <AnimatePresence>
      {!isFinished && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ y: '-100%', transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } }}
          className="fixed inset-0 z-[100] bg-heritage-stone flex flex-col items-center justify-center"
        >
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <h2 className="font-serif text-2xl text-heritage-gold mb-4 italic">
              Preparing the Hearth...
            </h2>
            <div className="w-48 h-[1px] bg-heritage-gold/20 relative overflow-hidden mx-auto">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-heritage-gold"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>
            <p className="font-sans text-[10px] tracking-[0.3em] uppercase mt-4 text-heritage-espresso/40">
              {Math.min(100, Math.round(progress))}%
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
