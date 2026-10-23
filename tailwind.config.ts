import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0F766E",
        danger: "#DC2626",
        warning: "#D97706",
      },
    },
  },
  plugins: [],
};

export default config;
