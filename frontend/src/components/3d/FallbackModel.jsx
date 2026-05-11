import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshTransmissionMaterial, Float } from '@react-three/drei'
import * as THREE from 'three'

export function FallbackModel({ theme }) {
  const meshRef = useRef()

  const geometry = new THREE.TorusKnotGeometry(1, 0.35, 100, 32, 2, 3)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (meshRef.current) {
      meshRef.current.rotation.x = Math.sin(t * 0.4) * 0.15
      meshRef.current.rotation.y = t * 0.12
      meshRef.current.rotation.z = Math.cos(t * 0.3) * 0.1
    }
  })

  return (
    <Float speed={1.5} rotationIntensity={0.6} floatIntensity={0.3} >
      <mesh ref={meshRef} geometry={geometry} scale={[1.8, 1.8, 1.8]} castShadow receiveShadow >
        <MeshTransmissionMaterial
          backside              
          samples={16}          
          thickness={0.5}       
          roughness={0.05}      
          transmission={0.95}   
          ior={1.5}             
          chromaticAberration={0.06} 
          distortion={0.15}     
          distortionScale={0.3} 
          temporalDistortion={0.2} 
          color={theme === 'dark' ? "#D97706" : "#FFFBEB"}       
        />
      </mesh>
    </Float>
  )
}
