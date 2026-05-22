import Footer from "../components/Footer";
import PageMeta from "../components/SEO/PageMeta";

const sections = [
  {
    title: "Information We Collect",
    body: "Jaya Dhaba collects information guests provide while browsing the menu, placing orders, booking reservations, sending inquiries, or tracking an order. This may include name, phone number, email address, delivery or table details, order contents, reservation date, reservation time, and guest count.",
  },
  {
    title: "How We Use Your Information",
    body: "We use guest information to prepare orders, confirm reservations, process service requests, respond to contact messages, support order tracking, maintain restaurant records, and improve the dining experience at Jaya Dhaba, East Marredpally, Secunderabad.",
  },
  {
    title: "Reservations Data",
    body: "Reservation details such as guest name, phone number, date, time, party size, table assignment, and status are used to manage seating and service flow. We may use the phone number to confirm or update a booking.",
  },
  {
    title: "Payment Data",
    body: "Online payment processing is handled through Razorpay. Jaya Dhaba does not store full card or banking credentials; we store only the payment status, transaction references, and order information needed for restaurant operations, refunds, and support.",
  },
  {
    title: "Data Retention",
    body: "Order, reservation, inquiry, and Razorpay payment reference records may be retained for operational, accounting, tax, fraud-prevention, and customer-support purposes. Records are retained only as long as reasonably required for restaurant operations or applicable Indian legal obligations.",
  },
  {
    title: "Third-Party Services",
    body: "We may use service providers such as Razorpay for payments and hosting or communication providers for website operations. These providers process limited information needed to perform their services and are expected to follow applicable Indian data protection and security obligations.",
  },
  {
    title: "Your Rights",
    body: "Guests may contact Jaya Dhaba to request correction of inaccurate contact, order, or reservation information, or to ask questions about data used for restaurant service and payment support.",
  },
  {
    title: "Governing Law",
    body: "This privacy policy is interpreted under Indian law, including applicable provisions of the Information Technology Act, 2000 and related rules. Disputes will be subject to competent jurisdiction in Telangana, India.",
  },
  {
    title: "Contact Us",
    body: "For privacy questions, contact Jaya Dhaba at 07386185821 or visit us at East Marredpally, Secunderabad.",
  },
];

export default function Privacy() {
  return (
    <div className="min-h-screen heritage-stone-bg">
      <PageMeta
        title="Privacy Policy"
        description="Privacy policy for Jaya Dhaba restaurant, Secunderabad. How we collect and use your data."
        url="/privacy"
      />
      <main className="px-6 md:px-20 py-32">
        <div className="max-w-4xl mx-auto space-y-14">
          <div className="space-y-5">
            <span className="text-heritage-gold font-black uppercase tracking-[0.6em] text-[10px] block">Effective 2024</span>
            <h1 className="text-5xl md:text-7xl font-serif italic text-heritage-espresso leading-none">Privacy Policy</h1>
            <p className="text-lg text-heritage-espresso/60 font-medium leading-relaxed italic max-w-2xl">
              This policy explains how Jaya Dhaba handles guest information for dining, ordering, reservations, payments, and inquiries.
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
