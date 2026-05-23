import JsonLd from './JsonLd';
import { RESTAURANT, SITE_URL, absoluteUrl } from './seoConfig';

export function buildWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: RESTAURANT.name,
    url: SITE_URL,
    potentialAction: {
      '@type': 'ReservationAction',
      target: absoluteUrl('/reservations'),
    },
  };
}

export function buildMenuSchema(menuItems = []) {
  const availableItems = menuItems.filter((item) => item.available !== false);
  const sections = availableItems.reduce((acc, item) => {
    const category = item.category || item.category_name || 'Signature Dishes';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: 'Jaya Dhaba Menu',
    url: absoluteUrl('/menu'),
    hasMenuSection: Object.entries(sections).map(([name, items]) => ({
      '@type': 'MenuSection',
      name,
      hasMenuItem: items.map((item) => ({
        '@type': 'MenuItem',
        name: item.name,
        description: item.description || 'Authentic Indian dish prepared at Jaya Dhaba, East Marredpally, Secunderabad.',
        offers: {
          '@type': 'Offer',
          price: String(item.price_full || item.price || item.price_half || 0),
          priceCurrency: 'INR',
        },
      })),
    })),
  };
}

export function buildReservationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishmentReservation',
    reservationFor: {
      '@type': 'FoodEstablishment',
      name: RESTAURANT.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: RESTAURANT.address.streetAddress,
        addressLocality: RESTAURANT.address.addressLocality,
        addressRegion: RESTAURANT.address.addressRegion,
        addressCountry: RESTAURANT.address.addressCountry,
      },
    },
  };
}

export function buildContactSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    name: 'Contact Jaya Dhaba',
    url: absoluteUrl('/contact'),
  };
}

export function WebSiteSchema() {
  return <JsonLd data={buildWebSiteSchema()} />;
}

export function MenuSchema({ items }) {
  return <JsonLd data={buildMenuSchema(items)} />;
}

export function ReservationSchema() {
  return <JsonLd data={buildReservationSchema()} />;
}

export function ContactSchema() {
  return <JsonLd data={buildContactSchema()} />;
}
