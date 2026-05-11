import React, { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import HeroContainer from "../components/HeroContainer";
import Info from "../components/Info";
import Platforms from "../components/Platforms";
import Contact from "../components/Contact";
import Footer from "../components/Footer";
import StickyCartBar from "../components/StickyCartBar";

const AboutOwner = lazy(() => import("../components/AboutOwner"));
const SpecialOffers = lazy(() => import("../components/SpecialOffers"));
const Services = lazy(() => import("../components/Services"));
const MenuDisplay = lazy(() => import("../components/MenuDisplay"));
const Gallery = lazy(() => import("../components/Gallery"));
const Testimonials = lazy(() => import("../components/Testimonials"));

const PageSkeleton = () => (
  <div className="py-20 flex flex-col items-center justify-center space-y-6 min-h-[300px]">
    <Loader2 className="animate-spin text-heritage-gold" size={36} />
    <p className="text-[10px] font-black uppercase tracking-[0.4em] text-heritage-espresso/30">Loading Heritage Experience...</p>
  </div>
);

/**
 * Jaya Dhaba | Main Landing Page
 * Unified under the 'Saffron & Stone' Premium Heritage System.
 */
export default function Home() {
  return (
    <div className="home-root min-h-screen">
      <main>
        <section id="hero">
          <HeroContainer />
        </section>

        <section id="owner">
          <Suspense fallback={<PageSkeleton />}>
            <AboutOwner />
          </Suspense>
        </section>

        <section id="offers">
          <Suspense fallback={<PageSkeleton />}>
            <SpecialOffers />
          </Suspense>
        </section>

        <section id="services">
          <Suspense fallback={<PageSkeleton />}>
            <Services />
          </Suspense>
        </section>

        <section id="menu">
          <Suspense fallback={<PageSkeleton />}>
            <MenuDisplay />
          </Suspense>
        </section>

        <section id="gallery">
          <Suspense fallback={<PageSkeleton />}>
            <Gallery />
          </Suspense>
        </section>

        <section id="testimonials">
          <Suspense fallback={<PageSkeleton />}>
            <Testimonials />
          </Suspense>
        </section>

        <section id="platforms">
          <Platforms />
        </section>

        <section id="info">
          <Info />
        </section>

        <section id="contact">
          <Contact />
        </section>
      </main>

      <Footer />

      {/* Interaction Layers */}
      <StickyCartBar />
    </div>
  );
}
