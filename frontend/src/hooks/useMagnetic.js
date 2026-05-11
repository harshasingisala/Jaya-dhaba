import { useRef, useState } from 'react'

export function useMagnetic() {
  const ref = useRef(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    const { clientX, clientY } = e
    const { height, width, left, top } = ref.current.getBoundingClientRect()
    
    // Calculate distance from center of button
    const x = clientX - (left + width / 2)
    const y = clientY - (top + height / 2)
    
    // Limit the "pull" to 0.35 intensity
    setPosition({ x: x * 0.35, y: y * 0.35 })
  }

  const reset = () => setPosition({ x: 0, y: 0 })

  return { ref, position, handleMouseMove, reset }
}
