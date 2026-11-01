declare module '*.css'
declare module '@fontsource-variable/dm-sans'
declare module '@fontsource-variable/newsreader'

/** The webview build replaces process.platform with the host's platform (see esbuild.mts). */
declare const process: { platform: string }
