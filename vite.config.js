import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the GitHub Pages project subpath so asset URLs resolve to
// https://morom46.github.io/ai-guitar-theory-coach/assets/... instead of the domain root.
export default defineConfig({
  base: "/ai-guitar-theory-coach/",
  plugins: [react()],
});
