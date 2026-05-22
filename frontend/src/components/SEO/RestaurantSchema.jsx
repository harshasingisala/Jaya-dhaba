import JsonLd from './JsonLd';
import { RESTAURANT, SITE_URL, absoluteUrl } from './seoConfig';

export function buildRestaurantSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['Restaurant', 'LocalBusiness'],
    name: RESTAURANT.name,
    description: RESTAURANT.description,
    url: SITE_URL,
    telephone: RESTAURANT.phone,
    foundingDate: RESTAURANT.foundingDate,
    priceRange: RESTAURANT.priceRange,
    servesCuisine: RESTAURANT.cuisine,
    currenciesAccepted: RESTAURANT.currency,
    paymentAccepted: RESTAURANT.paymentAccepted,
    address: {
      '@type': 'PostalAddress',
      ...RESTAURANT.address,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: RESTAURANT.geo.latitude,
      longitude: RESTAURANT.geo.longitude,
    },
    hasMap: RESTAURANT.mapUrl,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: RESTAURANT.openingHours.opens,
        closes: RESTAURANT.openingHours.closes,
      },
    ],
    menu: absoluteUrl('/menu'),
    reservations: absoluteUrl('/reservations'),
    sameAs: [RESTAURANT.mapUrl],
  };
}

export default function RestaurantSchema() {
  return <JsonLd data={buildRestaurantSchema()} />;
}
