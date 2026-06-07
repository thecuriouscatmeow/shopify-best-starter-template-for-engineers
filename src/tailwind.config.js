/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './**/*.liquid',
    './assets/*.js',
  ],
  theme: {
    extend: {
      screens: {
        tablet:  '750px',
        desktop: '990px',
      },
      // Color tokens are space-separated RGB triplets (see assets/tokens.css).
      // Wrapping in rgb(... / <alpha-value>) makes opacity utilities work,
      // e.g. bg-background, text-foreground/75, border-border/50.
      colors: {
        background:  'rgb(var(--color-background) / <alpha-value>)',
        foreground:  'rgb(var(--color-foreground) / <alpha-value>)',
        accent:      'rgb(var(--color-accent) / <alpha-value>)',
        'accent-foreground': 'rgb(var(--color-accent-foreground) / <alpha-value>)',
        primary:     'rgb(var(--color-primary) / <alpha-value>)',
        'primary-fg':'rgb(var(--color-primary-fg) / <alpha-value>)',
        secondary:   'rgb(var(--color-secondary) / <alpha-value>)',
        border:      'rgb(var(--color-border) / <alpha-value>)',
        error:       'rgb(var(--color-error) / <alpha-value>)',
        success:     'rgb(var(--color-success) / <alpha-value>)',
        navy:        'rgb(var(--color-navy) / <alpha-value>)',
      },
      fontFamily: {
        body:    ['var(--font-body)'],
        heading: ['var(--font-heading)'],
      },
      spacing: {
        xs:    'var(--spacing-xs)',
        sm:    'var(--spacing-sm)',
        md:    'var(--spacing-md)',
        lg:    'var(--spacing-lg)',
        xl:    'var(--spacing-xl)',
        '2xl': 'var(--spacing-2xl)',
        '3xl': 'var(--spacing-3xl)',
        section: 'var(--spacing-section)',
      },
      maxWidth: {
        page:        'var(--page-width)',
        'page-narrow': 'var(--page-width-narrow)',
      },
      borderRadius: {
        sm:   'var(--border-radius-sm)',
        md:   'var(--border-radius-md)',
        lg:   'var(--border-radius-lg)',
        pill: 'var(--border-radius-pill)',
      },
      transitionDuration: {
        short:   'var(--duration-short)',
        DEFAULT: 'var(--duration-default)',
        long:    'var(--duration-long)',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--easing-default)',
      },
      zIndex: {
        header:      'var(--z-header)',
        'cart-drawer': 'var(--z-cart-drawer)',
        modal:       'var(--z-modal)',
        notification: 'var(--z-notification)',
      },
    },
  },
  plugins: [],
};
