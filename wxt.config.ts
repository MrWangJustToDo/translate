import react from "@my-react/react-vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  vite: () => ({
    plugins: [react()],
  }),
  webExt: {
    disabled: true,
  },
  manifest: {
    permissions: ["storage", "activeTab"],
    web_accessible_resources: [{
      matches: ["<all_urls>"],
      resources: ["devtool/index.js"],
    }],
  },
  outDir: "dist",
  modules: ["@wxt-dev/module-react"],
});
