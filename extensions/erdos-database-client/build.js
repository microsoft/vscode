const { build } = require("esbuild")

build({
    entryPoints: ['./src/extension.ts'],
    format: 'cjs',
    bundle: true,
    outfile: "out/extension.js",
    platform: 'node',
    logLevel: 'error',
    metafile: true,
    sourcemap:'external',
    sourceRoot:__dirname,
    minify:false,
    watch:false,
    external: ['vscode', 'pg-native', 'cardinal', 'aws4', 'mongodb-client-encryption'],
    plugins: [
        {
            name: 'build notice',
            setup(build) {
                console.log('build')
            },
        },
    ],
})