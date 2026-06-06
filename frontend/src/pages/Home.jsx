import React, { Suspense, lazy, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import HeroContainer from "../components/HeroContainer";
import PageMeta from "../components/SEO/PageMeta";
import { ContactSchema, WebSiteSchema } from "../components/SEO/PageSchemas";
import { useApp } from "../context/AppContext";

const AboutOwner = lazy(() => import("../components/AboutOwner"));
const SpecialOffers = lazy(() => import("../components/SpecialOffers"));
const Services = lazy(() => import("../components/Services"));
const MenuDisplay = lazy(() => import("../components/MenuDisplay"));
const Gallery = lazy(() => import("../components/Gallery"));
const Testimonials = lazy(() => import("../components/Testimonials"));
const Platforms = lazy(() => import("../components/Platforms"));
const Info = lazy(() => import("../components/Info"));
const Contact = lazy(() => import("../components/Contact"));
const Footer = lazy(() => import("../components/Footer"));
const StickyCartBar = lazy(() => import("../components/StickyCartBar"));
const TableWaiterCall = lazy(() => import("../components/TableWaiterCall"));

const PageSkeleton = () => (
  <div className="py-20 flex flex-col items-center justify-center space-y-6 min-h-[300px]">
    <Loader2 className="animate-spin text-heritage-gold" size={36} />
    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-heritage-espresso/70">Loading Heritage Experience...</p>
  </div>
);

function LazyOnView({ children, rootMargin = "450px 0px", minHeight = 300, initialVisible = false }) {
  const [visible, setVisible] = useState(initialVisible);
  const ref = React.useRef(null);

  useEffect(() => {
    if (visible) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, visible]);

  return (
    <div ref={ref} style={!visible ? { minHeight } : undefined}>
      {visible ? children : null}
    </div>
  );
}

/**
 * Jaya Dhaba | Main Landing Page
 * Unified under the 'Saffron & Stone' Premium Heritage System.
 */
export default function Home() {
  const { hash, pathname } = useLocation();
  const { cart } = useApp();
  const isContactPage = pathname === "/contact";
  const isMenuPage = pathname === "/menu";
  const page = pathname === "/menu"
    ? {
        title: "Menu",
        description: "Explore the full menu at Jaya Dhaba, Secunderabad. Fresh Indian cuisine, traditional recipes, available for dine-in and takeaway.",
        url: "/menu",
      }
    : pathname === "/contact"
      ? {
          title: "Contact & Location",
          description: "Find Jaya Dhaba at East Marredpally, Secunderabad. Call 07386185821. Open daily 11 AM - 11 PM.",
          url: "/contact",
        }
      : {
          title: "Authentic Indian Restaurant in Secunderabad",
          description: "Jaya Dhaba - Heritage Restored. Flavor Perfected. Authentic Indian dining in East Marredpally, Secunderabad. Open 11 AM - 11 PM daily.",
          url: "/",
      };

  useEffect(() => {
    if (isContactPage || isMenuPage) return;
    const targetId = pathname === "/contact" ? "contact" : hash.replace("#", "");
    if (!targetId) return;

    const timer = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    return () => window.clearTimeout(timer);
  }, [hash, isContactPage, isMenuPage, pathname]);

  if (isContactPage) {
    return (
      <div className="home-root min-h-screen">
        <PageMeta {...page} />
        <ContactSchema />
        <main>
          <section id="contact">
            <Suspense fallback={<PageSkeleton />}>
              <Contact />
            </Suspense>
          </section>
        </main>
        <Suspense fallback={null}>
          <Footer />
        </Suspense>
      </div>
    );
  }

  if (isMenuPage) {
    return (
      <div className="home-root min-h-screen">
        <PageMeta {...page} />
        <WebSiteSchema />
        <main>
          <section id="menu">
            <Suspense fallback={<PageSkeleton />}>
              <MenuDisplay />
            </Suspense>
          </section>
        </main>
        <Suspense fallback={null}>
          <Footer />
          <StickyCartBar />
          <TableWaiterCall />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="home-root min-h-screen">
      <PageMeta {...page} />
      {pathname === "/contact" ? <ContactSchema /> : <WebSiteSchema />}
      <main>
        <section id="hero">
          <HeroContainer />
        </section>

        <section id="owner">
          <LazyOnView minHeight={520}>
            <Suspense fallback={<PageSkeleton />}>
              <AboutOwner />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="offers">
          <LazyOnView minHeight={420}>
            <Suspense fallback={<PageSkeleton />}>
              <SpecialOffers />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="services">
          <LazyOnView minHeight={620}>
            <Suspense fallback={<PageSkeleton />}>
              <Services />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="menu">
          <LazyOnView minHeight={720} initialVisible={hash === "#menu"}>
            <Suspense fallback={<PageSkeleton />}>
              <MenuDisplay />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="gallery">
          <LazyOnView minHeight={620}>
            <Suspense fallback={<PageSkeleton />}>
              <Gallery />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="testimonials">
          <LazyOnView minHeight={420}>
            <Suspense fallback={<PageSkeleton />}>
              <Testimonials />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="platforms">
          <LazyOnView minHeight={540}>
            <Suspense fallback={<PageSkeleton />}>
              <Platforms />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="info">
          <LazyOnView minHeight={620}>
            <Suspense fallback={<PageSkeleton />}>
              <Info />
            </Suspense>
          </LazyOnView>
        </section>

        <section id="contact">
          <LazyOnView minHeight={720}>
            <Suspense fallback={<PageSkeleton />}>
              <Contact />
            </Suspense>
          </LazyOnView>
        </section>
      </main>

      <section id="footer">
        <LazyOnView minHeight={360} rootMargin="250px 0px">
          <Suspense fallback={null}>
            <Footer />
          </Suspense>
        </LazyOnView>
      </section>

      {/* Interaction Layers */}
      {cart.length > 0 && (
        <Suspense fallback={null}>
          <StickyCartBar />
        </Suspense>
      )}
    </div>
  );
}
