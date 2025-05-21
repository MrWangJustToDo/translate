import { heroui } from "@heroui/react";

const config = {
  content: [
    "entrypoints/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  darkMode: "class",
  plugins: [heroui()],
};

export default config;
