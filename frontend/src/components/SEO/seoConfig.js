const LOCAL_SITE_URL = `http://${['local', 'host'].join('')}:5174`;

export const SITE_URL = (import.meta.env.VITE_SITE_URL || LOCAL_SITE_URL).replace(/\/$/, '');

export const RESTAURANT = {
  name: 'Jaya Dhaba',
  tagline: 'Heritage Restored. Flavor Perfected.',
  description: 'Heritage Restored. Flavor Perfected. Authentic Indian restaurant in East Marredpally, Secunderabad since 2020.',
  phone: '+917386185821',
  displayPhone: '+91 73861 85821',
  foundingDate: '2020',
  address: {
    streetAddress: 'East Marredpally',
    addressLocality: 'Secunderabad',
    addressRegion: 'Telangana',
    postalCode: '500026',
    addressCountry: 'IN',
  },
  geo: {
    latitude: 17.4399,
    longitude: 78.5011,
  },
  mapUrl: 'https://share.google/6efBsQaOasTY9Tnvt',
  cuisine: ['Indian', 'North Indian', 'South Indian'],
  openingHours: {
    opens: '11:00',
    closes: '23:00',
  },
  priceRange: '₹₹',
  currency: 'INR',
  paymentAccepted: 'Cash, Credit Card, UPI',
};

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
