const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

// Extension main build config
const extensionConfig = {
	entryPoints: ['src/extension.ts'],
	bundle: true,
	format: 'cjs',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'node',
	outfile: 'dist/extension.js',
	external: ['vscode'],
	logLevel: 'silent',
	plugins: [
		/* add to the end of plugins array */
		esbuildProblemMatcherPlugin,
	],
};

// Webview build config
const webviewConfig = {
	entryPoints: ['src/webview/main.ts'],
	bundle: true,
	format: 'iife',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'browser',
	outfile: 'dist/webview.js',
	logLevel: 'silent',
	plugins: [
		esbuildProblemMatcherPlugin,
	],
};

const configs = [extensionConfig, webviewConfig];

async function main() {
	try {
		if (watch) {
			// Watch mode - build all configs
			const contexts = await Promise.all(configs.map(config => esbuild.context(config)));
			await Promise.all(contexts.map(ctx => ctx.watch()));
			console.log('Watching for changes...');
		} else {
			// Single build
			await Promise.all(configs.map(config => esbuild.build(config)));
			console.log('Build complete');
		}
	} catch (err) {
		process.stderr.write(err.stderr);
		process.exit(1);
	}
}

main();
