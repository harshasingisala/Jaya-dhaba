import { Helmet } from '../../vendor/react-helmet-async';
import { absoluteUrl } from './seoConfig';

export default function PageMeta({
  title,
  description,
  url,
  image = absoluteUrl('/og-image.jpg'),
  robots = 'index, follow',
  type = 'website',
}) {
  const canonical = absoluteUrl(url || '/');
  const imageUrl = absoluteUrl(image);
  const fullTitle = `${title} | Jaya Dhaba`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <link rel="canonical" href={canonical} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Jaya Dhaba" />
      <meta property="og:image" content={imageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}
