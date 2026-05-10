/**
 * JAYA DHABA — GOLDEN COURTYARD DESIGN SYSTEM
 * Single source of truth for all brand tokens.
 * These map directly to the CSS variables in index.css.
 */
export const THEME = {
  // Core Palette (Light)
  bgCream:         '#FAF9F6',   // Off-white page background
  brownSaddle:     '#8B4513',   // Primary dark-brown brand color (logo, text)
  goldBrand:       '#C9A050',   // Golden CTA and accents
  goldRich:        '#D4A017',   // Darker gold for hover states

  // Extended
  espresso:        '#1A1A1A',   // Near-black for body text
  stone:           '#EAE5DD',   // Light beige card backgrounds
  terracotta:      '#C05621',   // Secondary accent

  // Typography
  fontSerif:       "'Playfair Display', serif",
  fontSans:        "'Plus Jakarta Sans', sans-serif",
};

/**
 * CSS variable names that map to index.css root tokens.
 * Use these as references; do NOT use raw hex codes in components.
 */
export const CSS_VARS = {
  bgPrimary:   'var(--bg-primary)',
  textMain:    'var(--text-main)',
  textAccent:  'var(--text-accent)',
  ctaColor:    'var(--cta-color)',
  gold:        'var(--heritage-gold)',
  goldBrand:   'var(--gold-brand)',
  brownBrand:  'var(--brown-brand)',
};
