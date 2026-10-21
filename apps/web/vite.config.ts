import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Относительные пути: сборка работает и из подкаталога GitHub Pages, и с локального диска.
  base: "./",
  plugins: [react()],
});
