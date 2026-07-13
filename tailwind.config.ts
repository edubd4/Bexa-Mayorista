import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Tokens neutros `app-` — theme-aware via CSS variables (regla de oro #2).
        // Este archivo es IDÉNTICO en todos los proyectos: el rebrand vive en globals.css.
        // Accent colors use RGB format for Tailwind opacity modifier support (e.g. bg-app-accent/15)
        app: {
          bg: "var(--app-bg)",
          card: "var(--app-card)",
          input: "var(--app-input)",
          accent: "rgb(var(--app-accent) / <alpha-value>)",
          "accent-2": "rgb(var(--app-accent-2) / <alpha-value>)",
          green: "rgb(var(--app-green) / <alpha-value>)",
          red: "rgb(var(--app-red) / <alpha-value>)",
          amber: "rgb(var(--app-amber) / <alpha-value>)",
          violet: "rgb(var(--app-violet) / <alpha-value>)",
          text: "var(--app-text)",
          secondary: "var(--app-text-secondary)",
          muted: "var(--app-text-muted)",
          surface: "var(--app-surface)",
          "surface-low": "var(--app-surface-low)",
          "surface-mid": "var(--app-surface-mid)",
          "surface-high": "var(--app-surface-high)",
          "surface-highest": "var(--app-surface-highest)",
          steel: "var(--app-steel)",
          outline: "var(--app-outline)",
          line: "var(--app-line)",
          "line-soft": "var(--app-line-soft)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        display: ["var(--app-font-display)", "sans-serif"],
        sans: ["var(--app-font-sans)", "sans-serif"],
        body: ["var(--app-font-sans)", "sans-serif"],
        mono: ["var(--app-font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "app-grad": "var(--app-grad)",
        "app-grad-2": "var(--app-grad-2)",
      },
    },
  },
  plugins: [],
};
export default config;
