import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Environment, Preload, AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei'
import { ErrorBoundary } from 'react-error-boundary'
import { FallbackModel } from './FallbackModel'

function PerfHandler() {
  return (
    <PerformanceMonitor
      onDecline={() => {
        if (import.meta.env.DEV) console.warn("Performance Monitor: FPS declined, adapting.")
      }}
    />
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.25} color="#FEF3C7" />
      
      <directionalLight
        position={[5, 10, 7.5]}
        intensity={2.5}
        color="#FBBF24"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      
      <pointLight position={[0, -5, 3]} intensity={1.5} color="#D97706" decay={2} />
    </>
  )
}

function CanvasFallback() {
  return (
    <mesh rotation={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#D97706" wireframe />
    </mesh>
  )
}

export function Scene({ theme }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 200 }}
      dpr={[1, 2]} 
      shadows
      gl={{
        antialias: true,
        alpha: true, 
        stencil: false,
        depth: true,
        powerPreference: 'high-performance', 
        toneMapping: 2, 
        toneMappingExposure: 1.1,
      }}
      className="pointer-events-auto" 
    >
      <Lights />
      
      <Suspense fallback={null}>
        <Environment preset="sunset" blur={0} />
      </Suspense>
      
      <ErrorBoundary fallback={<CanvasFallback />}>
        <Suspense fallback={<CanvasFallback />}>
          <FallbackModel theme={theme} />
        </Suspense>
      </ErrorBoundary>
      
      <AdaptiveDpr pixelated />
      <AdaptiveEvents />
      <PerfHandler />
      <Preload all />
    </Canvas>
  )
}
