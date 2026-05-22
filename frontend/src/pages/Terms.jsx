import Footer from "../components/Footer";
import PageMeta from "../components/SEO/PageMeta";

const sections = [
  {
    title: "Use of Service",
    body: "Jaya Dhaba operates this website for guests who want to browse our menu, place orders, book reservations, track orders, and contact our restaurant at East Marredpally, Secunderabad. By using the website, you agree to provide accurate details and use the service only for lawful restaurant-related purposes.",
  },
  {
    title: "Reservations",
    body: "Reservations are accepted based on table availability, service hours, party size, and operational capacity. Jaya Dhaba may contact you on the phone number provided to confirm, reschedule, or cancel a reservation when required by kitchen or seating conditions.",
  },
  {
    title: "Payments",
    body: "Online payments may be processed through Razorpay or another approved payment partner. A payment is treated as complete only when the payment provider and Jaya Dhaba both confirm the transaction against the relevant order.",
  },
  {
    title: "Ordering Policy",
    body: "Menu prices, item availability, preparation time, and delivery or pickup estimates may change during live service. Once food preparation begins, cancellation or modification requests may be limited to protect food quality and kitchen operations.",
  },
  {
    title: "Intellectual Property",
    body: "The Jaya Dhaba name, website content, menu descriptions, photographs, interface design, and brand presentation belong to Jaya Dhaba or its licensors. Guests may not copy, reuse, or commercially exploit this material without written permission.",
  },
  {
    title: "Limitation of Liability",
    body: "Jaya Dhaba aims to keep website, menu, reservation, payment, and tracking information accurate. Temporary technical issues, payment gateway delays, or restaurant service delays may occur, and our liability is limited to the value of the affected order or reservation service.",
  },
  {
    title: "Governing Law",
    body: "These terms are governed by the laws of India. Any dispute relating to website use, online orders, reservations, or restaurant services will be subject to the competent courts and consumer forums having jurisdiction in Telangana, India.",
  },
  {
    title: "Contact Information",
    body: "For questions about these terms, orders, reservations, or payments, contact Jaya Dhaba at East Marredpally, Secunderabad or use the contact section on this website.",
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen heritage-stone-bg">
      <PageMeta
        title="Terms of Service"
        description="Terms of service for Jaya Dhaba restaurant, Secunderabad."
        url="/terms"
      />
      <main className="px-6 md:px-20 py-32">
        <div className="max-w-4xl mx-auto space-y-14">
          <div className="space-y-5">
            <span className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px] block">Effective 2024</span>
            <h1 className="text-5xl md:text-7xl font-serif italic text-heritage-espresso leading-none">Terms of Service</h1>
            <p className="text-lg text-heritage-espresso/60 font-medium leading-relaxed italic max-w-2xl">
              These terms explain how guests may use Jaya Dhaba's website, ordering, reservation, payment, and guest service tools.
            </p>
          </div>

          <div className="bg-white/50 backdrop-blur-xl rounded-[3rem] border border-heritage-espresso/5 shadow-xl divide-y divide-heritage-espresso/5">
            {sections.map((section) => (
              <section key={section.title} className="p-8 md:p-10 space-y-3">
                <h2 className="text-2xl font-serif italic text-heritage-espresso">{section.title}</h2>
                <p className="text-sm text-heritage-espresso/60 leading-7 font-medium">{section.body}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
