import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { benchPlugin } from "./server/bench.mjs"

export default defineConfig({
  plugins: [react(), benchPlugin()],
})
