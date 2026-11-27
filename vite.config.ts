import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    // Relative asset paths so the build works from any host path.
    base: './',
    plugins: [react()],
})
