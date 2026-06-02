import React, { Suspense, lazy, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { useLocation } from "react-router-dom";
import api from "../api";
import HeroContainer from "../components/HeroContainer";
import Info from "../components/Info";
import Platforms from "../components/Platforms";
import Contact from "../components/Contact";
import Footer from "../components/Footer";
import StickyCartBar from "../components/StickyCartBar";
import PageMeta from "../components/SEO/PageMeta";
import { ContactSchema, WebSiteSchema } from "../components/SEO/PageSchemas";
import { useApp } from "../context/AppContext";

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

const WAITER_REASONS = [
  { value: "need_assistance", label: "Need assistance" },
  { value: "need_water", label: "Need water" },
  { value: "have_question", label: "Have a question" },
  { value: "requesting_bill", label: "Request bill" },
];

function TableWaiterCall() {
  const { tableOrderContext } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tableSession = tableOrderContext?.table_session;

  if (!tableSession) return null;

  const callWaiter = async (reason) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.callWaiter({ tableSession, reason });
      setOpen(false);
      setMessage("Waiter called - we'll be right with you");
      window.setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage(error.message || "Could not call waiter. Please ask nearby staff.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-28 right-4 z-[110] flex w-[min(18rem,calc(100vw-2rem))] flex-col items-end gap-2 md:bottom-8">
      {message && (
        <div className="rounded-2xl bg-green-600 px-4 py-3 text-sm font-bold text-white shadow-xl">
          {message}
        </div>
      )}
      {open && (
        <div className="w-full rounded-2xl bg-white p-2 shadow-2xl ring-1 ring-orange-100">
          {WAITER_REASONS.map((reason) => (
            <button
              key={reason.value}
              onClick={() => callWaiter(reason.value)}
              disabled={busy}
              className="block min-h-11 w-full rounded-xl px-3 text-left text-sm font-bold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
        className="inline-flex min-h-12 items-center gap-2 rounded-full bg-amber-950 px-4 text-xs font-black uppercase tracking-widest text-white shadow-xl disabled:opacity-60"
      >
        <BellRing size={17} />
        {busy ? "Calling..." : "Call waiter"}
      </button>
    </div>
  );
}

/**
 * Jaya Dhaba | Main Landing Page
 * Unified under the 'Saffron & Stone' Premium Heritage System.
 */
export default function Home() {
  const { hash, pathname } = useLocation();
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
            <Contact />
          </section>
        </main>
        <Footer />
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
        <Footer />
        <StickyCartBar />
        <TableWaiterCall />
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
