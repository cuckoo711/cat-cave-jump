import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [vue()],
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __VUE_OPTIONS_API__: false,
    },
    publicDir: false,
    build: {
        outDir: 'ui/dist',
        lib: {
            entry: fileURLToPath(new URL('./ui/main.js', import.meta.url)),
            name: 'CaveUI',
            formats: ['iife'],
            fileName: () => 'cave-ui.js',
            cssFileName: 'cave-ui',
        },
    },
});
