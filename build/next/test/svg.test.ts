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
import { optimizeSvgFiles } from '../svg.ts';
import { applyIncrementalClientChanges, copyFile } from '../transpile.ts';

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
	<rect x="0" y="0" width="16" height="16" fill="#ff0000"/>
</svg>`;
const optimizedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="red" d="M0 0h16v16H0z"/></svg>';

suite('SVG finishing', () => {
	for (const minify of [false, true]) {
		test(`covers emitted assets and copied resources (minify: ${minify})`, async context => {
			const { sourceDir, outDir } = await createFixture(context);
			await Promise.all([
				fs.promises.writeFile(path.join(sourceDir, 'emitted.svg'), sourceSvg),
				fs.promises.writeFile(path.join(sourceDir, 'copied.svg'), sourceSvg),
				fs.promises.writeFile(path.join(sourceDir, 'entry.css'), '.icon { background-image: url("./emitted.svg"); }'),
			]);

			const result = await esbuild.build({
				stdin: { contents: 'import "./entry.css";', resolveDir: sourceDir, loader: 'ts' },
				bundle: true,
				minify,
				outdir: outDir,
				assetNames: 'media/[name]',
				loader: { '.svg': 'file' },
				write: false,
			});
			for (const file of result.outputFiles) {
				await fs.promises.mkdir(path.dirname(file.path), { recursive: true });
				await fs.promises.writeFile(file.path, file.contents);
			}

			const copiedPath = path.join(outDir, 'vs', 'feature', 'copied.svg');
			await copyFile(path.join(sourceDir, 'copied.svg'), copiedPath);
			const otherPaths = result.outputFiles.filter(file => !file.path.endsWith('.svg')).map(file => file.path);
			const binaryPath = path.join(outDir, 'image.png');
			const mapPath = path.join(outDir, 'copied.svg.map');
			await fs.promises.writeFile(binaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]));
			await fs.promises.writeFile(mapPath, 'not an SVG');
			await fs.promises.mkdir(path.join(outDir, 'directory.svg'));
			otherPaths.push(binaryPath, mapPath);
			const otherContents = await Promise.all(otherPaths.map(file => fs.promises.readFile(file)));

			await optimizeSvgFiles(outDir, minify);

			assert.deepStrictEqual({
				emitted: await fs.promises.readFile(path.join(outDir, 'media', 'emitted.svg'), 'utf8'),
				copied: await fs.promises.readFile(copiedPath, 'utf8'),
				otherFiles: await Promise.all(otherPaths.map(file => fs.promises.readFile(file))),
				sources: await Promise.all(['emitted.svg', 'copied.svg'].map(file => fs.promises.readFile(path.join(sourceDir, file), 'utf8'))),
			}, {
				emitted: minify ? optimizedSvg : sourceSvg,
				copied: minify ? optimizedSvg : sourceSvg,
				otherFiles: otherContents,
				sources: [sourceSvg, sourceSvg],
			});
		});
	}

	test('does not parse SVGs or require an output tree when minification is disabled', async context => {
		const { root, outDir } = await createFixture(context);
		const filePath = path.join(outDir, 'malformed.svg');
		const input = '<svg><path></svg>';
		await fs.promises.writeFile(filePath, input);

		await optimizeSvgFiles(outDir, false);
		await optimizeSvgFiles(path.join(root, 'not-created'), false);

		assert.strictEqual(await fs.promises.readFile(filePath, 'utf8'), input);
	});

	test('leaves incremental development resources unoptimized', async context => {
		const { root, sourceDir, outDir } = await createFixture(context);
		await fs.promises.writeFile(path.join(sourceDir, 'development.svg'), sourceSvg);

		await applyIncrementalClientChanges(root, 'out', ['src/development.svg']);

		assert.strictEqual(await fs.promises.readFile(path.join(outDir, 'development.svg'), 'utf8'), sourceSvg);
	});

	test('accepts output trees without SVGs', async context => {
		const { outDir } = await createFixture(context);
		await optimizeSvgFiles(outDir, true);
		assert.deepStrictEqual(await fs.promises.readdir(outDir), []);
	});

	test('does not follow linked source directories', async context => {
		const { sourceDir, outDir } = await createFixture(context);
		await fs.promises.writeFile(path.join(sourceDir, 'source.svg'), sourceSvg);
		await fs.promises.symlink(sourceDir, path.join(outDir, 'linked-source'), process.platform === 'win32' ? 'junction' : 'dir');

		await optimizeSvgFiles(outDir, true);

		assert.strictEqual(await fs.promises.readFile(path.join(sourceDir, 'source.svg'), 'utf8'), sourceSvg);
	});

	test('rejects missing output trees', async context => {
		const { root } = await createFixture(context);
		await assert.rejects(optimizeSvgFiles(path.join(root, 'not-created'), true), { code: 'ENOENT' });
	});

	test('propagates optimization failures with the file path and preserves the failed input', async context => {
		const { outDir } = await createFixture(context);
		const filePath = path.join(outDir, 'malformed image.svg');
		const input = '<svg>\n<path></svg>';
		await fs.promises.writeFile(filePath, input);

		await assert.rejects(optimizeSvgFiles(outDir, true), error => {
			assert.ok(error instanceof Error);
			assert.ok(error.message.includes(filePath), error.message);
			assert.match(error.message, /Unexpected close tag/);
			return true;
		});
		assert.strictEqual(await fs.promises.readFile(filePath, 'utf8'), input);
	});

	test('does not grow already compact SVGs', async context => {
		const { outDir } = await createFixture(context);
		const filePath = path.join(outDir, 'compact.svg');
		const input = '<svg width="1e3" height="1e3"/>';
		await fs.promises.writeFile(filePath, input);

		await optimizeSvgFiles(outDir, true);

		assert.strictEqual(await fs.promises.readFile(filePath, 'utf8'), input);
	});

	test('preserves IDs, references, accessibility, theming, and license information', async context => {
		const { outDir } = await createFixture(context);
		const filePath = path.join(outDir, 'semantic.svg');
		const input = `<!-- Copyright (c) Microsoft Corporation. Licensed under the MIT License. -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32" viewBox="0 0 32 32" role="img" aria-labelledby="title" aria-describedby="description" focusable="false" tabindex="0">
	<title id="title">Accessible illustration</title>
	<desc id="description">Created with an SVG editor</desc>
	<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><cc:Work xmlns:cc="http://creativecommons.org/ns#"><cc:license rdf:resource="https://opensource.org/licenses/MIT"/></cc:Work></rdf:RDF></metadata>
	<style>/* Copyright (c) Microsoft Corporation. Licensed under the MIT License. */use { stroke: var(--vscode-foreground); }</style>
	<defs>
		<linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
		<clipPath id="clip"><rect width="24" height="24"/></clipPath>
		<path id="shape" d="M0 0 L16 0 L16 16 L0 16 Z"/>
	</defs>
	<g clip-path="url(#clip)">
		<use xlink:href="#shape" fill="url(#paint)"/>
		<use href="#shape" x="8" fill="var(--vscode-foreground)"/>
	</g>
	<path id="external-fragment" opacity="0" d="M0 0 L8 0 L8 8 Z" aria-hidden="true"/>
</svg>`;
		await fs.promises.writeFile(filePath, input);

		await optimizeSvgFiles(outDir, true);

		const output = await fs.promises.readFile(filePath, 'utf8');
		assert.deepStrictEqual(svgContracts(output), svgContracts(input));
		assert.ok(Buffer.byteLength(output) < Buffer.byteLength(input));
	});

	test('preserves representative product assets', async context => {
		const { outDir } = await createFixture(context);
		const sourceRoot = path.resolve(import.meta.dirname, '../../../src');
		const examples = [
			'vs/workbench/contrib/extensions/browser/media/language-icon.svg',
			'vs/workbench/contrib/extensions/browser/media/loading.svg',
			'vs/workbench/contrib/welcomeGettingStarted/common/media/multi-file-edits.svg',
		];
		const inputs = await Promise.all(examples.map(async file => {
			const sourcePath = path.join(sourceRoot, file);
			await copyFile(sourcePath, path.join(outDir, file));
			return fs.promises.readFile(sourcePath, 'utf8');
		}));

		await optimizeSvgFiles(outDir, true);

		const outputs = await Promise.all(examples.map(file => fs.promises.readFile(path.join(outDir, file), 'utf8')));
		assert.deepStrictEqual(outputs.map(svgContracts), inputs.map(svgContracts));
		assert.ok(outputs.reduce((sum, text) => sum + Buffer.byteLength(text), 0) < inputs.reduce((sum, text) => sum + Buffer.byteLength(text), 0));
		assert.match(outputs[1], /<\/style><g><circle/);
	});
});

async function createFixture(context: TestContext): Promise<{ root: string; sourceDir: string; outDir: string }> {
	const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-svg-'));
	context.after(() => fs.promises.rm(root, { recursive: true, force: true }));
	const sourceDir = path.join(root, 'src');
	const outDir = path.join(root, 'out');
	await Promise.all([fs.promises.mkdir(sourceDir), fs.promises.mkdir(outDir)]);
	return { root, sourceDir, outDir };
}

function svgContracts(content: string) {
	return {
		attributes: [...content.matchAll(/\b(?:id|role|aria-[\w-]+|viewBox|focusable|tabindex)="[^"]*"/g)].map(match => match[0]).sort(),
		references: [...new Set([...content.matchAll(/(?:xlink:)?href="[^"]*"|url\(#[^)]+\)/g)].map(match => match[0]))].sort(),
		accessibleText: [...content.matchAll(/<(?:title|desc)\b[^>]*>[^<]*<\/(?:title|desc)>/g)].map(match => match[0]).sort(),
		licenseComment: content.match(/<!--(?<notice>[\s\S]*?)-->/)?.groups?.notice.trim(),
		metadata: content.match(/<metadata>[\s\S]*?<\/metadata>/)?.[0],
		styles: [...content.matchAll(/<style>(?<css>[\s\S]*?)<\/style>/g)].map(match => match.groups?.css.trim()),
		themeColors: [...new Set(content.match(/var\(--[^)]+\)/g))].sort(),
	};
}
