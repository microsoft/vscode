/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { type RawSourceMap, SourceMapConsumer } from 'source-map';
import { nlsPlugin, createNLSCollector, finalizeNLS, postProcessNLS } from '../nls-plugin.ts';
import { adjustSourceMap } from '../private-to-property.ts';

// analyzeLocalizeCalls requires the import path to end with `/nls`
const NLS_STUB = [
	'export function localize(key: string, message: string, ...args: any[]): string {',
	'\treturn message;',
	'}',
	'export function localize2(key: string, message: string, ...args: any[]): { value: string; original: string } {',
	'\treturn { value: message, original: message };',
	'}',
].join('\n');

interface BundleResult {
	js: string;
	mapJson: RawSourceMap;
	map: SourceMapConsumer;
	cleanup: () => void;
}

/**
 * Helper: create a temp directory with source files, bundle with NLS, and return
 * the generated JS + parsed source map. The NLS stub is automatically placed at
 * `vs/nls.ts` so test files can import from `../vs/nls` (when placed in `test/`).
 */
async function bundleWithNLS(
	files: Record<string, string>,
	entryPoint: string,
	opts?: { postProcess?: boolean; minify?: boolean }
): Promise<BundleResult> {
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nls-sm-test-'));
	const srcDir = path.join(tmpDir, 'src');
	const outDir = path.join(tmpDir, 'out');
	await fs.promises.mkdir(srcDir, { recursive: true });
	await fs.promises.mkdir(outDir, { recursive: true });

	// Write source files (always include the NLS stub at vs/nls.ts)
	const allFiles = { 'vs/nls.ts': NLS_STUB, ...files };
	for (const [name, content] of Object.entries(allFiles)) {
		const filePath = path.join(srcDir, name);
		await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
		await fs.promises.writeFile(filePath, content);
	}

	const collector = createNLSCollector();

	const result = await esbuild.build({
		entryPoints: [path.join(srcDir, entryPoint)],
		outfile: path.join(outDir, entryPoint.replace(/\.ts$/, '.js')),
		bundle: true,
		format: 'esm',
		platform: 'neutral',
		target: ['es2024'],
		packages: 'external',
		sourcemap: 'linked',
		sourcesContent: true,
		minify: opts?.minify ?? false,
		write: false,
		plugins: [
			nlsPlugin({ baseDir: srcDir, collector }),
		],
		tsconfigRaw: JSON.stringify({
			compilerOptions: {
				experimentalDecorators: true,
				useDefineForClassFields: false
			}
		}),
		logLevel: 'warning',
	});

	let jsContent = '';
	let mapContent = '';

	for (const file of result.outputFiles!) {
		if (file.path.endsWith('.js')) {
			jsContent = file.text;
		} else if (file.path.endsWith('.map')) {
			mapContent = file.text;
		}
	}

	// Optionally apply NLS post-processing (replaces placeholders with indices)
	if (opts?.postProcess) {
		const nlsResult = await finalizeNLS(collector, outDir);
		const preNLSCode = jsContent;
		const nlsProcessed = postProcessNLS(jsContent, nlsResult.indexMap, false);
		jsContent = nlsProcessed.code;

		// Adjust source map for NLS edits
		if (nlsProcessed.edits.length > 0) {
			const mapJson = JSON.parse(mapContent);
			const adjusted = adjustSourceMap(mapJson, preNLSCode, nlsProcessed.edits);
			mapContent = JSON.stringify(adjusted);
		}
	}

	assert.ok(jsContent, 'Expected JS output');
	assert.ok(mapContent, 'Expected source map output');

	const mapJson = JSON.parse(mapContent);
	const map = new SourceMapConsumer(mapJson);
	const cleanup = () => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	};

	return { js: jsContent, mapJson, map, cleanup };
}

/**
 * Find the 1-based line number in `text` that contains `needle`.
 */
function findLine(text: string, needle: string): number {
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes(needle)) {
			return i + 1; // 1-based
		}
	}
	throw new Error(`Could not find "${needle}" in text`);
}

/**
 * Find the 0-based column of `needle` within the line that contains it.
 */
function findColumn(text: string, needle: string): number {
	const lines = text.split('\n');
	for (const line of lines) {
		const col = line.indexOf(needle);
		if (col !== -1) {
			return col;
		}
	}
	throw new Error(`Could not find "${needle}" in text`);
}

suite('NLS plugin source maps', () => {

	test('NLS plugin transforms localize calls into placeholders', async () => {
		const source = [
			'import { localize } from "../vs/nls";',
			'export const msg = localize("testKey", "Test Message");',
		].join('\n');

		const { js, cleanup } = await bundleWithNLS(
			{ 'test/verify.ts': source },
			'test/verify.ts',
		);

		try {
			assert.ok(js.includes('%%NLS:'),
				'Bundle should contain %%NLS: placeholder.\nActual JS (first 500 chars):\n' + js.substring(0, 500));
		} finally {
			cleanup();
		}
	});

	test('file without localize calls has correct source map', async () => {
		const source = [
			'export function add(a: number, b: number): number {',
			'\treturn a + b;',
			'}',
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'simple.ts': source },
			'simple.ts',
		);

		try {
			const bundleLine = findLine(js, 'return a + b');
			const bundleCol = findColumn(js, 'return a + b');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });
			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 2, 'Should map to line 2 of original');
		} finally {
			cleanup();
		}
	});

	test('sourcesContent should contain original source, not NLS-transformed', async () => {
		const source = [
			'import { localize } from "../vs/nls";',
			'export const msg = localize("myKey", "Hello World");',
			'export function greet(): string {',
			'\treturn msg;',
			'}',
		].join('\n');

		const { mapJson, cleanup } = await bundleWithNLS(
			{ 'test/greeting.ts': source },
			'test/greeting.ts',
		);

		try {
			const sourcesContent: string[] = mapJson.sourcesContent ?? [];
			const sources: string[] = mapJson.sources ?? [];
			const greetingIdx = sources.findIndex((s: string) => s.includes('greeting'));
			assert.ok(greetingIdx >= 0, 'Should find greeting.ts in sources');

			const greetingContent = sourcesContent[greetingIdx];
			assert.ok(greetingContent, 'Should have sourcesContent for greeting.ts');

			assert.ok(!greetingContent.includes('%%NLS:'),
				'sourcesContent should NOT contain NLS placeholder.\nActual:\n' + greetingContent);
			assert.ok(greetingContent.includes('localize("myKey", "Hello World")'),
				'sourcesContent should contain the exact original localize call.\nActual:\n' + greetingContent);
		} finally {
			cleanup();
		}
	});

	test('NLS-affected nested file keeps a non-duplicated source path', async () => {
		const source = [
			'import { localize } from "../../vs/nls";',
			'export const msg = localize("myKey", "Hello World");',
		].join('\n');

		const { mapJson, cleanup } = await bundleWithNLS(
			{ 'nested/deep/file.ts': source },
			'nested/deep/file.ts',
		);

		try {
			const sources: string[] = mapJson.sources ?? [];
			const nestedSource = sources.find((s: string) => s.endsWith('/nested/deep/file.ts'));
			assert.ok(nestedSource, 'Should find nested/deep/file.ts in sources');
			assert.ok(!nestedSource.includes('/nested/deep/nested/deep/file.ts'),
				`Source path should not duplicate directory segments. Actual: ${nestedSource}`);
		} finally {
			cleanup();
		}
	});

	test('line mapping correct for code after localize calls', async () => {
		const source = [
			'import { localize } from "../vs/nls";',                         // 1
			'const label = localize("key1", "A long message");',            // 2
			'const label2 = localize("key2", "Another message");',          // 3
			'export function computeResult(x: number): number {',           // 4
			'\treturn x * 42;',                                              // 5
			'}',                                                             // 6
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/multi.ts': source },
			'test/multi.ts',
		);

		try {
			const bundleLine = findLine(js, 'return x * 42');
			const bundleCol = findColumn(js, 'return x * 42');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });
			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 5, 'Should map back to line 5');
		} finally {
			cleanup();
		}
	});

	test('column mapping for code on same line after localize call', async () => {
		// The NLS placeholder is longer than the original key, so column offsets
		// for tokens AFTER the localize call on the same line will drift if
		// source map mappings point to the NLS-transformed source positions.
		const source = [
			'import { localize } from "../vs/nls";',
			'const x = localize("k", "m"); const z = "FINDME"; export { x, z };',
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/coldrift.ts': source },
			'test/coldrift.ts',
		);

		try {
			assert.ok(js.includes('%%NLS:'), 'Bundle should contain NLS placeholders');

			const bundleLine = findLine(js, 'FINDME');
			const bundleCol = findColumn(js, '"FINDME"');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });

			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 2, 'Should map to line 2');

			// The original column of "FINDME" in the source
			const originalCol = findColumn(source, '"FINDME"');

			// The mapped column should match the ORIGINAL source positions.
			// Allow drift from TS->JS transform (const->var, export removal, etc.)
			// but NOT the large NLS placeholder drift (~100+ chars) from before the fix.
			const columnDrift = Math.abs(pos.column! - originalCol);
			assert.ok(columnDrift <= 20,
				`Column should be close to original. Expected ~${originalCol}, got ${pos.column} (drift: ${columnDrift}). ` +
				`A drift > 20 indicates the NLS placeholder shift leaked into the source map.`);
		} finally {
			cleanup();
		}
	});

	test('class with localize - method positions map correctly', async () => {
		const source = [
			'import { localize } from "../vs/nls";',                                       // 1
			'',                                                                             // 2
			'export class MyWidget {',                                                      // 3
			'\tprivate readonly label = localize("widgetLabel", "My Cool Widget");',        // 4
			'',                                                                             // 5
			'\tconstructor(private readonly name: string) {}',                              // 6
			'',                                                                             // 7
			'\tgetDescription(): string {',                                                 // 8
			'\t\treturn this.name + ": " + this.label;',                                   // 9
			'\t}',                                                                          // 10
			'',                                                                             // 11
			'\tdispose(): void {',                                                         // 12
			'\t\tconsole.log("disposed");',                                                // 13
			'\t}',                                                                          // 14
			'}',                                                                            // 15
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/widget.ts': source },
			'test/widget.ts',
		);

		try {
			const bundleLine = findLine(js, '"disposed"');
			const bundleCol = findColumn(js, 'console.log');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });
			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 13, 'Should map dispose method body to line 13');
		} finally {
			cleanup();
		}
	});

	test('many localize calls - line mappings remain correct', async () => {
		const source = [
			'import { localize } from "../vs/nls";',                        // 1
			'',                                                              // 2
			'const a = localize("a", "Alpha");',                            // 3
			'const b = localize("b", "Bravo with a longer message");',      // 4
			'const c = localize("c", "Charlie");',                          // 5
			'const d = localize("d", "Delta is the fourth");',              // 6
			'const e = localize("e", "Echo");',                             // 7
			'',                                                              // 8
			'export function getAll(): string {',                           // 9
			'\treturn [a, b, c, d, e].join(", ");',                         // 10
			'}',                                                             // 11
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/many.ts': source },
			'test/many.ts',
		);

		try {
			const bundleLine = findLine(js, '.join(", ")');
			const bundleCol = findColumn(js, '.join(", ")');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });
			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 10, 'Should map join() back to line 10');
		} finally {
			cleanup();
		}
	});

	test('post-processed NLS - source map still has original content', async () => {
		const source = [
			'import { localize } from "../vs/nls";',
			'export const msg = localize("greeting", "Hello World");',
		].join('\n');

		const { js, mapJson, cleanup } = await bundleWithNLS(
			{ 'test/post.ts': source },
			'test/post.ts',
			{ postProcess: true }
		);

		try {
			assert.ok(!js.includes('%%NLS:'), 'JS should not contain NLS placeholders after post-processing');

			const sources: string[] = mapJson.sources ?? [];
			const postIdx = sources.findIndex((s: string) => s.includes('post'));
			assert.ok(postIdx >= 0, 'Should find post.ts in sources');

			const postContent = (mapJson.sourcesContent ?? [])[postIdx];
			assert.ok(postContent, 'Should have sourcesContent for post.ts');

			assert.ok(postContent.includes('localize("greeting"'),
				'sourcesContent should still contain original localize("greeting") call');
			assert.ok(!postContent.includes('%%NLS:'),
				'sourcesContent should not contain NLS placeholders');
		} finally {
			cleanup();
		}
	});

	test('post-processed NLS - column mappings correct after placeholder replacement', async () => {
		// NLS placeholders like "%%NLS:test/drift#k%%" are much longer than their
		// replacements (e.g. "0"). Without source map adjustment the columns for
		// tokens AFTER the replacement drift by the cumulative length delta.
		const source = [
			'import { localize } from "../vs/nls";',                                   // 1
			'export const a = localize("k1", "Alpha"); export const MARKER = "FINDME";',   // 2
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/drift.ts': source },
			'test/drift.ts',
			{ postProcess: true }
		);

		try {
			assert.ok(!js.includes('%%NLS:'), 'Placeholders should be replaced');

			const bundleLine = findLine(js, 'FINDME');
			const bundleCol = findColumn(js, '"FINDME"');
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });

			assert.ok(pos.source, 'Should have source');
			assert.strictEqual(pos.line, 2, 'Should map to line 2');

			const originalCol = findColumn(source, '"FINDME"');
			const columnDrift = Math.abs(pos.column! - originalCol);
			assert.ok(columnDrift <= 20,
				`Column drift after NLS post-processing should be small. ` +
				`Expected ~${originalCol}, got ${pos.column} (drift: ${columnDrift}). ` +
				`Large drift means postProcessNLS edits were not applied to the source map.`);
		} finally {
			cleanup();
		}
	});

	test('minified bundle with NLS - end-to-end column mapping', async () => {
		// With minification, the entire output is (roughly) on one line.
		// Multiple NLS replacements compound their column shifts. A function
		// defined after several localize() calls must still map correctly.
		const source = [
			'import { localize } from "../vs/nls";',                               // 1
			'',                                                                     // 2
			'export const a = localize("k1", "Alpha message");',                   // 3
			'export const b = localize("k2", "Bravo message that is quite long");', // 4
			'export const c = localize("k3", "Charlie");',                         // 5
			'export const d = localize("k4", "Delta is the fourth letter");',      // 6
			'',                                                                     // 7
			'export function computeResult(x: number): number {',                  // 8
			'\treturn x * 42;',                                                     // 9
			'}',                                                                    // 10
		].join('\n');

		const { js, map, cleanup } = await bundleWithNLS(
			{ 'test/minified.ts': source },
			'test/minified.ts',
			{ postProcess: true, minify: true }
		);

		try {
			assert.ok(!js.includes('%%NLS:'), 'Placeholders should be replaced');

			// Find the computeResult function in the minified output.
			// esbuild minifies `x * 42` and may rename the parameter, so
			// search for `*42` which survives both minification and renaming.
			const needle = '*42';
			const bundleLine = findLine(js, needle);
			const bundleCol = findColumn(js, needle);
			const pos = map.originalPositionFor({ line: bundleLine, column: bundleCol });

			assert.ok(pos.source, 'Should have source for minified mapping');
			assert.strictEqual(pos.line, 9,
				`Should map "*42" back to line 9. Got line ${pos.line}.`);
		} finally {
			cleanup();
		}
	});
});
