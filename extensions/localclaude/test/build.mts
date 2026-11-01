// Bundles the unit tests (the LocalClaude desktop app's test suite, run against the shared modules).
import esbuild from 'esbuild';
import * as path from 'node:path';

const root = path.dirname(import.meta.dirname);
await esbuild.build({
	entryPoints: [path.join(root, 'test', 'agent.test.ts'), path.join(root, 'test', 'smartKnowledge.test.ts')],
	bundle: true,
	platform: 'node',
	format: 'esm',
	outdir: path.join(root, 'test', 'out'),
	outExtension: { '.js': '.mjs' },
	alias: { electron: path.join(root, 'test', 'electron-stub.js') },
	external: ['@anthropic-ai/claude-agent-sdk', 'unpdf', 'cross-spawn'],
	logLevel: 'warning',
});
