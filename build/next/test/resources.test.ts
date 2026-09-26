/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { pathToFileURL } from 'url';
import * as vm from 'vm';
import { SourceMapConsumer, type RawSourceMap } from 'source-map';
import { copyResources, getResourcePaths, type BuildTarget } from '../resources.ts';
import { optimizeSvgFiles } from '../svg.ts';
import { applyIncrementalClientChanges, copyFile } from '../transpile.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const preDirectory = 'vs/workbench/contrib/webview/browser/pre';
const serviceWorkerPath = `${preDirectory}/service-worker.js`;
const targets: BuildTarget[] = ['desktop', 'server', 'server-web', 'web'];
const webviewTargets: BuildTarget[] = ['desktop', 'server-web', 'web'];
const sourceMapBaseUrl = 'https://example.test/sourcemaps/commit/core';
const script = `// This explanatory comment and the long local name should not be emitted in a minified production resource.
function calculateAnswer(longParameterName) {
	return longParameterName + 1;
}
globalThis.answer = calculateAnswer(41);
`;

suite('production resources', () => {
	test('covers every currently copied JavaScript resource for each target', async () => {
		const inventory = await Promise.all(targets.map(async target => ({
			target,
			javascript: (await getResourcePaths(path.join(repoRoot, 'src'), target)).filter(file => /\.(?:cjs|mjs|js)$/.test(file)),
		})));
		assert.deepStrictEqual(inventory, [
			{ target: 'desktop', javascript: [serviceWorkerPath] },
			{ target: 'server', javascript: [] },
			{ target: 'server-web', javascript: [serviceWorkerPath] },
			{ target: 'web', javascript: [serviceWorkerPath] },
		]);
	});

	for (const target of targets) {
		test(`minifies all selected scripts, not bundled/generated outputs (${target})`, async t => {
			const { srcDir, outDir } = await createFixture(t);
			const otherScriptPath = `${preDirectory}/another-script.js`;
			const htmlPath = `${preDirectory}/index.html`;
			const svgPath = 'vs/workbench/browser/media/code-icon.svg';
			const shellPath = 'vs/base/node/cpuUsage.sh';
			const html = '<!DOCTYPE html>\r\n<p>Leave this alone</p>\r\n';
			const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M 0 0 L 1 1"/></svg>';
			await writeFile(srcDir, serviceWorkerPath, script);
			await writeFile(srcDir, otherScriptPath, script);
			await writeFile(srcDir, htmlPath, html);
			await writeFile(srcDir, `${preDirectory}/index-dev.html`, 'development only');
			await writeFile(srcDir, svgPath, svg);
			await writeFile(srcDir, shellPath, '#!/bin/sh\nexit 0\n');

			const untouchedOutputs = ['vs/workbench/workbench.desktop.main.js', 'already.min.js', 'nls.messages.js'];
			for (const file of untouchedOutputs) {
				await writeFile(outDir, file, '// Previously emitted output\nvar alreadyMinified=1;\n');
			}

			await copyResources(srcDir, outDir, target, true);
			for (const file of [serviceWorkerPath, otherScriptPath]) {
				if (target === 'server') {
					assert.strictEqual(fs.existsSync(path.join(outDir, file)), false);
				} else {
					const output = await fs.promises.readFile(path.join(outDir, file), 'utf8');
					assert.doesNotMatch(output, /longParameterName|explanatory comment/);
					assert.strictEqual(vm.runInNewContext(`${output}\nanswer`), 42);
					assert.strictEqual(fs.existsSync(path.join(outDir, `${file}.map`)), true);
				}
				assert.strictEqual(await fs.promises.readFile(path.join(srcDir, file), 'utf8'), script);
			}
			for (const file of untouchedOutputs) {
				assert.strictEqual(await fs.promises.readFile(path.join(outDir, file), 'utf8'), '// Previously emitted output\nvar alreadyMinified=1;\n');
			}
			assert.deepStrictEqual({
				html: target === 'server' ? fs.existsSync(path.join(outDir, htmlPath)) : await fs.promises.readFile(path.join(outDir, htmlPath), 'utf8'),
				svg: target === 'server' ? fs.existsSync(path.join(outDir, svgPath)) : await fs.promises.readFile(path.join(outDir, svgPath), 'utf8'),
				shell: fs.existsSync(path.join(outDir, shellPath)),
				devHtml: fs.existsSync(path.join(outDir, preDirectory, 'index-dev.html')),
			}, {
				html: target === 'server' ? false : html,
				svg: target === 'server' ? false : svg,
				shell: target !== 'web',
				devHtml: false,
			});
		});
	}

	test('non-minified bundles and development copies remain byte-for-byte, without parsing', async t => {
		const { root, srcDir, outDir } = await createFixture(t);
		const source = Buffer.from('\uFEFF// Keep CRLF and comments\r\nthis is intentionally not valid JavaScript\r\n//# sourceMappingURL=original.map\r\n');
		await writeFile(srcDir, serviceWorkerPath, source);
		await copyResources(srcDir, outDir, 'desktop', false, sourceMapBaseUrl);
		await copyFile(path.join(srcDir, serviceWorkerPath), path.join(root, 'transpile', serviceWorkerPath));
		await applyIncrementalClientChanges(root, 'watch', [`src/${serviceWorkerPath}`]);

		const contents = await Promise.all(['out', 'transpile', 'watch'].map(dir => fs.promises.readFile(path.join(root, dir, serviceWorkerPath))));
		assert.deepStrictEqual(contents, [source, source, source]);
		assert.strictEqual(fs.existsSync(path.join(outDir, `${serviceWorkerPath}.map`)), false);
	});

	for (const minify of [false, true]) {
		test(`SVG finishing preserves copied JavaScript and its source map (minify: ${minify})`, async t => {
			const { srcDir, outDir } = await createFixture(t);
			const svgPath = 'vs/workbench/browser/media/code-icon.svg';
			const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect x="0" y="0" width="16" height="16" fill="#ff0000"/></svg>';
			await writeFile(srcDir, serviceWorkerPath, script);
			await writeFile(srcDir, svgPath, svg);
			await copyResources(srcDir, outDir, 'desktop', minify, sourceMapBaseUrl);
			const javascriptPaths = minify ? [serviceWorkerPath, `${serviceWorkerPath}.map`] : [serviceWorkerPath];
			const before = await Promise.all(javascriptPaths.map(file => fs.promises.readFile(path.join(outDir, file))));

			await optimizeSvgFiles(outDir, minify);

			assert.deepStrictEqual({
				javascript: await Promise.all(javascriptPaths.map(file => fs.promises.readFile(path.join(outDir, file)))),
				svg: await fs.promises.readFile(path.join(outDir, svgPath), 'utf8'),
				sources: await Promise.all([serviceWorkerPath, svgPath].map(file => fs.promises.readFile(path.join(srcDir, file), 'utf8'))),
			}, {
				javascript: before,
				svg: minify ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="red" d="M0 0h16v16H0z"/></svg>' : svg,
				sources: [script, svg],
			});
		});
	}

	test('preserves classic globals, top-level this, sloppy mode, and direct eval', async t => {
		const { srcDir, outDir } = await createFixture(t);
		const source = `var publicValue = this;
function publicHandler(longParameter) {
	var valueUsedByEval = longParameter + 1;
	return eval('valueUsedByEval');
}
function isSloppy() { return this === globalThis; }
`;
		await writeFile(srcDir, serviceWorkerPath, source);
		await copyResources(srcDir, outDir, 'desktop', true);
		const output = await fs.promises.readFile(path.join(outDir, serviceWorkerPath), 'utf8');
		const expression = '\nJSON.stringify([publicValue === globalThis, publicHandler(41), isSloppy()])';
		assert.deepStrictEqual([
			vm.runInNewContext(source + expression),
			vm.runInNewContext(output + expression),
		], ['[true,42,true]', '[true,42,true]']);
	});

	test('preserves CommonJS require, exports, wrapper this, shebang, and strict directive', async t => {
		const { srcDir, outDir } = await createFixture(t);
		const source = `#!/usr/bin/env node
/* Copyright (c) Example. Licensed under the MIT License. */
'use strict';
const importedValue = require('external-dependency');
exports.answer = importedValue + 1;
exports.wrapperThis = this === exports;
exports.strict = (function () { return this === undefined; })();
`;
		await writeFile(srcDir, serviceWorkerPath, source);
		await copyResources(srcDir, outDir, 'desktop', true);
		const output = await fs.promises.readFile(path.join(outDir, serviceWorkerPath), 'utf8');
		assert.ok(output.startsWith('#!/usr/bin/env node\n'));
		const exports = {};
		const wrapper = vm.compileFunction(output.replace(/^#![^\n]*\n/, ''), ['require', 'exports']);
		Reflect.apply(wrapper, exports, [() => 41, exports]);
		assert.deepStrictEqual(exports, { answer: 42, wrapperThis: true, strict: true });
	});

	test('preserves ESM exports, external imports, dynamic import, import.meta, and top-level await', async t => {
		const { srcDir, outDir } = await createFixture(t);
		const source = `import { externalValue } from './dependency.mjs';
export { externalValue as reexported } from './dependency.mjs';
export const answer = externalValue + (await import('./dependency.mjs')).increment;
export const moduleThis = this === undefined;
export const url = import.meta.url;
`;
		await writeFile(srcDir, serviceWorkerPath, source);
		// The dependency exists only in the output. Resource processing must not resolve or bundle it.
		await writeFile(outDir, `${preDirectory}/dependency.mjs`, 'export const externalValue = 41, increment = 1;\n');
		await copyResources(srcDir, outDir, 'web', true);
		const url = pathToFileURL(path.join(outDir, serviceWorkerPath)).href;
		const result: { answer: number; reexported: number; moduleThis: boolean; url: string } = await import(url);
		assert.deepStrictEqual({ ...result }, { answer: 42, reexported: 41, moduleThis: true, url });
	});

	test('retains license headers and legal comments with a composed, CDN-linked map', async t => {
		const { srcDir, outDir } = await createFixture(t);
		const header = '/* Copyright (c) Example. Licensed under the MIT License. */';
		const legalComment = '/*! @license Example dependency */';
		const source = `${header}\n${legalComment}\nglobalThis.recordValue(Date.now());\n`;
		await writeFile(srcDir, serviceWorkerPath, source);
		await copyResources(srcDir, outDir, 'web', true, `${sourceMapBaseUrl}/`);
		const output = await fs.promises.readFile(path.join(outDir, serviceWorkerPath), 'utf8');
		const map: RawSourceMap = JSON.parse(await fs.promises.readFile(path.join(outDir, `${serviceWorkerPath}.map`), 'utf8'));
		const consumer = new SourceMapConsumer(map);
		const position = consumer.originalPositionFor(positionOf(output, 'recordValue'));
		assert.deepStrictEqual({
			headerCount: output.split(header).length - 1,
			legalCommentCount: output.split(legalComment).length - 1,
			sourceContent: map.sourcesContent,
			source: position.source?.replaceAll('\\', '/').endsWith(serviceWorkerPath),
			line: position.line,
			column: position.column,
			mappingURL: output.trimEnd().split('\n').at(-1),
		}, {
			headerCount: 1,
			legalCommentCount: 1,
			sourceContent: [source],
			source: true,
			...positionOf(source, 'recordValue'),
			mappingURL: `//# sourceMappingURL=${sourceMapBaseUrl}/${serviceWorkerPath}.map`,
		});
	});

	for (const mapKind of ['inline', 'external'] as const) {
		test(`composes ${mapKind} input maps through minification`, async t => {
			const { srcDir, outDir } = await createFixture(t);
			const original = 'const originalValue: number = Date.now();\nglobalThis.recordValue(originalValue * 2);\n';
			const transformed = await esbuild.transform(original, { loader: 'ts', sourcefile: 'source.ts', sourcemap: 'external' });
			const inputMap: RawSourceMap = { ...JSON.parse(transformed.map), sourceRoot: '../original/' };
			const reference = mapKind === 'inline'
				? `data:application/json;base64,${Buffer.from(JSON.stringify(inputMap)).toString('base64')}`
				: 'maps/input.map';
			await writeFile(srcDir, serviceWorkerPath, `${transformed.code}//# sourceMappingURL=${reference}\n`);
			if (mapKind === 'external') {
				await writeFile(srcDir, `${preDirectory}/maps/input.map`, JSON.stringify(inputMap));
			}
			await copyResources(srcDir, outDir, 'server-web', true);
			const output = await fs.promises.readFile(path.join(outDir, serviceWorkerPath), 'utf8');
			const map: RawSourceMap = JSON.parse(await fs.promises.readFile(path.join(outDir, `${serviceWorkerPath}.map`), 'utf8'));
			const consumer = new SourceMapConsumer(map);
			const position = consumer.originalPositionFor(positionOf(output, 'recordValue'));
			assert.deepStrictEqual({
				source: position.source?.replaceAll('\\', '/').endsWith('/original/source.ts'),
				line: position.line,
				column: position.column,
				sourceContent: map.sourcesContent,
				mappingURL: output.trimEnd().split('\n').at(-1),
			}, {
				source: true,
				...positionOf(original, 'recordValue'),
				sourceContent: [original],
				mappingURL: '//# sourceMappingURL=service-worker.js.map',
			});
		});
	}

	for (const [name, source] of [
		['invalid syntax', 'function {'],
		['missing source map', 'var value = 1;\n//# sourceMappingURL=missing.map'],
		['invalid source map JSON', 'var value = 1;\n//# sourceMappingURL=data:application/json;base64,ew=='],
		['invalid source mappings', `var value = 1;\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify({
			version: 3, sources: ['source.js'], sourcesContent: ['var value = 1;'], names: [], mappings: '!',
		})).toString('base64')}`],
		['unsupported source map', 'var value = 1;\n//# sourceMappingURL=https://example.test/original.map'],
	]) {
		test(`fails explicitly with the resource name for ${name}`, async t => {
			const { srcDir, outDir } = await createFixture(t);
			await writeFile(srcDir, serviceWorkerPath, source);
			await assert.rejects(copyResources(srcDir, outDir, 'desktop', true), error => {
				assert.ok(error instanceof Error);
				assert.ok(error.message.includes(`[resources] Failed to process '${serviceWorkerPath}'`));
				assert.ok(error.cause instanceof Error);
				return true;
			});
			assert.strictEqual(fs.existsSync(path.join(outDir, serviceWorkerPath)), false);
			assert.strictEqual(await fs.promises.readFile(path.join(srcDir, serviceWorkerPath), 'utf8'), source);
		});
	}

	test('propagates output write failures without falling back to an unminified copy', async t => {
		const { srcDir, outDir } = await createFixture(t);
		await writeFile(srcDir, serviceWorkerPath, script);
		await fs.promises.mkdir(path.join(outDir, serviceWorkerPath), { recursive: true });
		await assert.rejects(copyResources(srcDir, outDir, 'desktop', true), error => {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes(serviceWorkerPath));
			assert.ok(error.cause instanceof Error);
			return true;
		});
	});

	for (const target of webviewTargets) {
		test(`emits a smaller service worker with unchanged lifecycle and request behavior (${target})`, async t => {
			const { srcDir, outDir } = await createFixture(t);
			const source = await fs.promises.readFile(path.join(repoRoot, 'src', serviceWorkerPath));
			await writeFile(srcDir, serviceWorkerPath, source);
			await copyResources(srcDir, outDir, target, true, sourceMapBaseUrl);
			const output = await fs.promises.readFile(path.join(outDir, serviceWorkerPath));
			t.diagnostic(`service-worker.js: ${source.length} -> ${output.length} bytes (including license and map reference)`);
			assert.ok(output.length < source.length / 2, 'Copied service worker should shrink by more than 50%');
			for (const platform of ['electron', 'web']) {
				const before = await exerciseServiceWorker(source.toString(), platform);
				const after = await exerciseServiceWorker(output.toString(), platform);
				assert.deepStrictEqual(after, before);
				assert.deepStrictEqual(after, {
					listeners: ['activate', 'fetch', 'install', 'message'],
					lifecycle: ['skipWaiting', 'claim'],
					marks: ['webview/service-worker/scriptStart'],
					statuses: [405, 404, 404, 202],
					fallbackUrls: ['http://localhost:3000/resource'],
					orphanStreamCancelled: true,
				});
			}
		});
	}
});

async function createFixture(t: TestContext) {
	const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-resources-test-'));
	t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
	await writeFile(root, 'package.json', '{"type":"module"}');
	await writeFile(root, 'tsconfig.json', '{"compilerOptions":{"alwaysStrict":true}}');
	const srcDir = path.join(root, 'src');
	await fs.promises.mkdir(srcDir);
	return { root, srcDir, outDir: path.join(root, 'out') };
}

async function writeFile(root: string, relativePath: string, contents: string | Uint8Array): Promise<void> {
	const filePath = path.join(root, relativePath);
	await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
	await fs.promises.writeFile(filePath, contents);
}

function positionOf(source: string, token: string) {
	const offset = source.indexOf(token);
	assert.ok(offset >= 0, `Missing token: ${token}`);
	const prefix = source.slice(0, offset);
	return { line: prefix.split('\n').length, column: offset - prefix.lastIndexOf('\n') - 1 };
}

interface WorkerTestEvent {
	waitUntil?: (promise: Promise<void>) => void;
	request?: Request;
	clientId?: string;
	respondWith?: (response: Response | Promise<Response>) => void;
	source?: { id: string };
	data?: { channel: string; data: { status: number; id: number; path: string; mime: string; stream: ReadableStream<Uint8Array> } };
}

async function exerciseServiceWorker(source: string, platform: string) {
	const listeners = new Map<string, (event: WorkerTestEvent) => void | Promise<void>>();
	const lifecycle: string[] = [];
	const marks: string[] = [];
	const responses: Promise<Response>[] = [];
	const pending: Promise<void>[] = [];
	const fallbackUrls: string[] = [];
	let orphanStreamCancelled = false;
	const location = new URL(`https://webview.example/pre/service-worker.js?v=6&vscode-resource-base-authority=resources.example&remoteAuthority=remote.example&platform=${platform}`);
	const self = {
		location,
		origin: location.origin,
		addEventListener: (name: string, listener: (event: WorkerTestEvent) => void | Promise<void>) => listeners.set(name, listener),
		skipWaiting: async () => { lifecycle.push('skipWaiting'); },
		clients: {
			claim: async () => { lifecycle.push('claim'); },
			get: async () => undefined,
			matchAll: async () => [],
		},
	};
	vm.runInNewContext(source, {
		self, location, URL, Response, ReadableStream, TransformStream,
		performance: { mark: (name: string) => marks.push(name) },
		fetch: async (request: Request) => {
			fallbackUrls.push(request.url);
			return new Response('fallback', { status: 202 });
		},
	});
	const dispatch = async (name: string, event: WorkerTestEvent) => {
		const listener = listeners.get(name);
		assert.ok(listener, `Missing service worker listener: ${name}`);
		await listener(event);
	};
	const waitUntil = (promise: Promise<void>) => { pending.push(promise); };
	await dispatch('install', { waitUntil });
	await dispatch('activate', { waitUntil });
	for (const [url, method] of [
		['https://file+.resources.example/resource', 'POST'],
		['https://file+.resources.example/resource', 'GET'],
		['https://remote.example/resource', 'GET'],
		['http://localhost:3000/resource', 'GET'],
		['https://unrelated.example/resource', 'GET'],
	]) {
		await dispatch('fetch', {
			request: new Request(url, { method }),
			clientId: 'missing-client',
			respondWith: response => { responses.push(Promise.resolve(response)); },
		});
	}
	await dispatch('message', {
		source: { id: 'outer-client' },
		data: {
			channel: 'did-load-resource',
			data: {
				status: 200, id: 1, path: '/resource', mime: 'text/plain',
				stream: new ReadableStream<Uint8Array>({ cancel: () => { orphanStreamCancelled = true; } }),
			},
		},
		waitUntil,
	});
	await Promise.all(pending);
	return {
		listeners: [...listeners.keys()].sort(),
		lifecycle,
		marks,
		statuses: (await Promise.all(responses)).map(response => response.status),
		fallbackUrls,
		orphanStreamCancelled,
	};
}
