import path from 'path'
import { defineConfig, normalizePath } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'


export default defineConfig(env => {
  
  const dev = env.mode === "development";

  return {
    resolve: {
      alias: {
        'ui-widgets': path.resolve(__dirname, '../../packages/ui-widgets/src'),
        'core': path.resolve(__dirname, '../../packages/core/src'),
        'core-browser': path.resolve(__dirname, '../../packages/core-browser/src'),
        'editor': path.resolve(__dirname, '../../packages/editor/src'),
        'editor-codemirror': path.resolve(__dirname, '../../packages/editor-codemirror/src'),
        'editor-types': path.resolve(__dirname, '../../packages/editor-types/src'),
        'editor-ui': path.resolve(__dirname, '../../packages/editor-ui/src'),
      }
    },
    define: {
      'process.env.DEBUG': '""',
      'process.env.NODE_ENV': '"production"',
      'process.env.TERM': '""',
      'process.platform': '""'
    },
    plugins: [
      viteStaticCopy({
        targets: [
          {
            src: normalizePath(path.resolve(__dirname, './dist/*')),
            dest: normalizePath(path.resolve(__dirname, '../../assets/www/editor'))
          }
        ]
      })
    ],
    build: {
      watch: dev ? {} : null,
      lib: {
        entry: 'src/index.tsx',
        formats: ['umd'],
        name: "QuartoVisualEditor",
        fileName: () => 'index.js' 
      },
      rollupOptions: {
        external: ['vscode-webview'],
      },
      sourcemap: dev ? 'inline' : false
    }
  };
 
});
