/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import * as vm from 'vm';
import File from 'vinyl';
import { createXlfFilesForCoreBundle } from '../../lib/i18n.ts';
import { computeNLSMetadataHash } from '../../lib/nlsMetadata.ts';
import { getBundleOptions } from '../bundle.ts';
import { collectNLSCalls, createNLSCatalog, extractNLSCatalog, loadNLSCatalog, NLS_CATALOG_FILE, prepareNLSCatalog, writeNLSFiles } from '../nls-catalog.ts';
import { nlsPlugin, postProcessNLS } from '../nls-plugin.ts';

const catalogFiles = ['nls.keys.json', 'nls.messages.json', 'nls.metadata.json', 'nls.messages.js'];
const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

suite('canonical NLS catalog', () => {
	let directory: string;
	let sourceDir: string;
	let sharedDir: string;
	let manifestPath: string;

	beforeEach(async () => {
		directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-nls-catalog-'));
		sourceDir = path.join(directory, 'src');
		sharedDir = path.join(directory, 'shared');
		manifestPath = path.join(sharedDir, NLS_CATALOG_FILE);
		await fs.promises.mkdir(sourceDir);
	});

	afterEach(async () => {
		await fs.promises.rm(directory, { recursive: true, force: true });
	});

	async function writeSource(file: string, contents: string): Promise<void> {
		const destination = path.join(sourceDir, file);
		await fs.promises.mkdir(path.dirname(destination), { recursive: true });
		await fs.promises.writeFile(destination, contents);
	}

	async function readCatalogFiles(outDir: string): Promise<string[]> {
		return Promise.all(catalogFiles.map(file => fs.promises.readFile(path.join(outDir, file), 'utf8')));
	}

	test('one catalog supports different desktop, server, server-web, and web graphs', async () => {
		await writeSource('vs/nls.ts', await fs.promises.readFile(path.join(repoRoot, 'src', 'vs', 'nls.ts'), 'utf8'));
		await writeSource('vs/workbench/common.ts', `
			import { localize, localize2 } from '../nls.js';
			export const label = localize('label', 'Common label');
			export const titled = localize2('label', 'Common label');
			export const fallback = localize('fallback', 'Untranslated {0}', 'value');
		`);
		for (const target of ['desktop', 'server', 'sessions']) {
			await writeSource(`vs/${target}/entry.ts`, `
				import { localize } from '../nls.js';
				export const label = localize('${target}', '${target} only');
			`);
		}
		const targets = {
			desktop: ['desktop'],
			server: ['server'],
			'server-web': ['server'],
			web: ['sessions'],
		};
		for (const [target, modules] of Object.entries(targets)) {
			await writeSource(`${target}.ts`, `
				import { label, titled, fallback } from './vs/workbench/common.js';
				${modules.map((module, index) => `import { label as extra${index} } from './vs/${module}/entry.js';`).join('\n')}
				export const result = [label, titled.value, titled.original, fallback, ${modules.map((_, index) => `extra${index}`).join(',')}];
			`);
		}
		await prepareNLSCatalog(sourceDir, sharedDir);
		const published = await readCatalogFiles(sharedDir);
		const identities: string[] = [];
		const translatedResults = await Promise.all(Object.entries(targets).map(async ([target, modules]) => {
			const catalog = await loadNLSCatalog(sourceDir, manifestPath);
			const result = await esbuild.build({
				...getBundleOptions(true, 'neutral'),
				entryPoints: [path.join(sourceDir, `${target}.ts`)],
				outfile: path.join(directory, target, 'bundle.js'),
				plugins: [nlsPlugin({ baseDir: sourceDir, catalog })],
			});
			const javascript = result.outputFiles?.find(file => file.path.endsWith('.js'));
			assert.ok(javascript);
			const code = postProcessNLS(javascript.text, catalog.indexMap, false).code;
			assert.doesNotMatch(code, /%%NLS/);
			const outputDir = path.join(directory, target);
			await writeNLSFiles(catalog, outputDir);
			assert.deepStrictEqual(await readCatalogFiles(outputDir), published);
			identities.push(computeNLSMetadataHash(outputDir, 'same-commit'));

			const [keysText, messagesText] = published;
			const keys: [string, string[]][] = JSON.parse(keysText);
			const defaults: string[] = JSON.parse(messagesText);
			const translations: Record<string, Record<string, string>> = {
				'vs/workbench/common': { label: 'Gemeinsame Beschriftung' },
			};
			const messages = keys.flatMap(([moduleId, moduleKeys]) => moduleKeys.map(key => translations[moduleId]?.[key]));
			const localized = messages.map((message, index) => message ?? defaults[index]);
			const context = { module: { exports: { result: [] as string[] } }, _VSCODE_NLS_MESSAGES: localized };
			vm.runInNewContext(esbuild.transformSync(code, { format: 'cjs' }).code, context);
			return { actual: Array.from(context.module.exports.result), expected: ['Gemeinsame Beschriftung', 'Gemeinsame Beschriftung', 'Common label', 'Untranslated value', ...modules.map(module => `${module} only`)] };
		}));
		assert.deepStrictEqual({
			results: translatedResults.map(result => result.actual),
			identities: new Set(identities).size,
			sharedFiles: await readCatalogFiles(sharedDir),
		}, {
			results: translatedResults.map(result => result.expected),
			identities: 1,
			sharedFiles: published,
		});
	});

	test('independent extraction includes unbundled runtime strings, not tests or declarations', async () => {
		await writeSource('vs/desktop/entry.ts', `import { localize } from '../nls.js'; localize('desktop', 'Desktop');`);
		await writeSource('vs/sessions/entry.ts', `import { localize } from '../nls.js'; localize('sessions', 'Sessions');`);
		await writeSource('vs/server/unused.ts', `import { localize } from '../nls.js'; localize({ key: 'unused', comment: ['Keep for translators'] }, 'Not in this target');`);
		await writeSource('vs/test/fixture.ts', `import { localize } from '../nls.js'; localize(variableKey, 'Test only');`);
		await writeSource('vs/fixture.test.ts', `import { localize } from './nls.js'; localize(variableKey, 'Test only');`);
		await writeSource('vs/fixture.d.ts', `import { localize } from './nls.js'; localize(variableKey, 'Declaration');`);
		const first = await extractNLSCatalog(sourceDir);
		const second = await extractNLSCatalog(sourceDir);
		assert.deepStrictEqual({
			entries: first.entries.map(entry => [entry.moduleId, entry.key, entry.message]),
			sameIndices: [...first.indexMap],
		}, {
			entries: [
				['vs/desktop/entry', 'desktop', 'Desktop'],
				['vs/server/unused', { key: 'unused', comment: ['Keep for translators'] }, 'Not in this target'],
				['vs/sessions/entry', 'sessions', 'Sessions'],
			],
			sameIndices: [...second.indexMap],
		});
	});

	test('translation export sees server and browser metadata, including translator comments', async () => {
		for (const module of ['server', 'sessions', 'workbench']) {
			await writeSource(`vs/${module}/entry.ts`, `import { localize } from '../nls.js'; export const label = localize({ key: 'label', comment: ['Translator context'] }, '${module} label');`);
		}
		await prepareNLSCatalog(sourceDir, sharedDir);
		const exported: File[] = [];
		const metadataFile = new File({
			path: path.join(sharedDir, 'nls.metadata.json'),
			contents: await fs.promises.readFile(path.join(sharedDir, 'nls.metadata.json')),
		});
		await new Promise<void>((resolve, reject) => {
			const exporter = createXlfFilesForCoreBundle();
			exporter.on('data', (file: File) => exported.push(file));
			exporter.on('error', reject);
			exporter.on('end', resolve);
			exporter.end(metadataFile);
		});
		assert.deepStrictEqual(exported.map(file => {
			const content = file.contents!.toString();
			return {
				file: file.relative.replace(/\\/g, '/'),
				translatorContext: content.includes('Translator context'),
				hasKey: content.includes('id="label"'),
			};
		}), ['server', 'sessions', 'workbench'].map(module => ({
			file: `vscode-${module}/vs_${module}.xlf`,
			translatorContext: true,
			hasKey: true,
		})));
	});

	test('ordering and comments are independent of input order and preserve both call kinds', () => {
		const calls = collectNLSCalls(`
			import { localize as text, localize2 } from './nls.js';
			text('Z', 'Upper');
			text('a', 'Lower');
			text('label', 'Shared');
			text({ key: 'label', comment: ['First instruction', 'Second instruction'] }, 'Shared');
			localize2({ key: 'label', comment: ['Another context'] }, 'Shared');
		`, 'vs/module');
		const catalog = createNLSCatalog(calls.map(call => call.entry));
		const reversed = createNLSCatalog(calls.map(call => call.entry).reverse());
		assert.deepStrictEqual({
			catalog,
			keys: catalog.entries.map(entry => entry.key),
			preserved: postProcessNLS(`localize("%%NLS:vs/module#label%%", "Shared"); localize2("%%NLS2:vs/module#label%%", "Shared");`, catalog.indexMap, true).code,
		}, {
			catalog: reversed,
			keys: [
				'Z', 'a',
				{ key: 'label', comment: ['Another context', 'First instruction', 'Second instruction'] },
				{ key: 'label', comment: ['Another context', 'First instruction', 'Second instruction'] },
			],
			preserved: `localize(3, "Shared"); localize2(2, "Shared");`,
		});
	});

	test('conflicting defaults for one translation key fail even across call kinds', () => {
		const entries = collectNLSCalls(`
			import { localize, localize2 } from './nls.js';
			localize('key', 'First');
			localize2('key', 'Different');
		`, 'vs/conflict').map(call => call.entry);
		assert.throws(() => createNLSCatalog(entries), /Conflicting default messages for vs\/conflict#key/);
	});

	test('source hashes are portable across source locations and LF/CRLF checkouts', async () => {
		const source = `import { localize } from './nls.js';\nexport const label = localize('key', 'Value');\n`;
		await writeSource('vs/entry.ts', source);
		await prepareNLSCatalog(sourceDir, sharedDir);
		const otherSourceDir = path.join(directory, 'other-src');
		await fs.promises.mkdir(path.join(otherSourceDir, 'vs'), { recursive: true });
		await fs.promises.writeFile(path.join(otherSourceDir, 'vs', 'entry.ts'), source.replace(/\n/g, '\r\n'));
		const otherOutDir = path.join(directory, 'other-out');
		await prepareNLSCatalog(otherSourceDir, otherOutDir);
		assert.deepStrictEqual({
			manifest: await fs.promises.readFile(path.join(otherOutDir, NLS_CATALOG_FILE), 'utf8'),
			entries: (await loadNLSCatalog(otherSourceDir, manifestPath)).entries,
		}, {
			manifest: await fs.promises.readFile(manifestPath, 'utf8'),
			entries: (await loadNLSCatalog(sourceDir, manifestPath)).entries,
		});
	});

	for (const change of ['add', 'change', 'remove'] as const) {
		test(`stale manifests fail after a source ${change}, including files outside the requested target`, async () => {
			await writeSource('vs/server/unused.ts', `import { localize } from '../nls.js'; localize('key', 'Value');`);
			await prepareNLSCatalog(sourceDir, sharedDir);
			if (change === 'add') {
				await writeSource('vs/sessions/new.ts', `import { localize } from '../nls.js'; localize('new', 'New');`);
			} else if (change === 'change') {
				await writeSource('vs/server/unused.ts', `import { localize } from '../nls.js'; localize('key', 'Changed');`);
			} else {
				await fs.promises.unlink(path.join(sourceDir, 'vs', 'server', 'unused.ts'));
			}
			await assert.rejects(loadNLSCatalog(sourceDir, manifestPath), /Stale catalog/);
		});
	}

	test('missing and malformed manifests do not fall back to target-local indexing', async () => {
		await assert.rejects(loadNLSCatalog(sourceDir, manifestPath), { code: 'ENOENT' });
		await fs.promises.mkdir(sharedDir);
		for (const manifest of ['{', '{}', JSON.stringify({ version: 1, sourceHash: 'hash', entries: [{ moduleId: 'module' }] })]) {
			await fs.promises.writeFile(manifestPath, manifest);
			await assert.rejects(loadNLSCatalog(sourceDir, manifestPath));
		}
	});

	test('a missing source directory is not treated as an empty catalog', async () => {
		await assert.rejects(extractNLSCatalog(path.join(directory, 'missing-src')), { code: 'ENOENT' });
	});

	test('reordered entries are rejected even when the catalog length is unchanged', async () => {
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; localize('a', 'First'); localize('b', 'Second');`);
		await prepareNLSCatalog(sourceDir, sharedDir);
		const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
		manifest.entries.reverse();
		await fs.promises.writeFile(manifestPath, JSON.stringify(manifest));
		await assert.rejects(loadNLSCatalog(sourceDir, manifestPath), /Non-canonical entries/);
	});

	test('failed extraction invalidates a previously published manifest', async () => {
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; localize('a', 'First');`);
		await prepareNLSCatalog(sourceDir, sharedDir);
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; localize('a', 'First'); localize('a', 'Different');`);
		await assert.rejects(prepareNLSCatalog(sourceDir, sharedDir), /Conflicting default messages/);
		await assert.rejects(fs.promises.readFile(manifestPath), { code: 'ENOENT' });
	});

	test('failed metadata publication does not leave a usable manifest', async () => {
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; localize('a', 'First');`);
		await prepareNLSCatalog(sourceDir, sharedDir);
		const messagesPath = path.join(sharedDir, 'nls.messages.json');
		await fs.promises.unlink(messagesPath);
		await fs.promises.mkdir(messagesPath);
		await assert.rejects(prepareNLSCatalog(sourceDir, sharedDir));
		await assert.rejects(fs.promises.readFile(manifestPath), { code: 'ENOENT' });
	});

	test('empty catalogs overwrite previous outputs instead of leaving old messages', async () => {
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; localize('a', 'First');`);
		await prepareNLSCatalog(sourceDir, sharedDir);
		await fs.promises.unlink(path.join(sourceDir, 'vs', 'entry.ts'));
		await prepareNLSCatalog(sourceDir, sharedDir);
		const files = await readCatalogFiles(sharedDir);
		assert.deepStrictEqual({
			entries: (await loadNLSCatalog(sourceDir, manifestPath)).entries,
			keys: JSON.parse(files[0]),
			messages: JSON.parse(files[1]),
			metadata: JSON.parse(files[2]),
		}, { entries: [], keys: [], messages: [], metadata: { keys: {}, messages: {} } });
	});

	test('bundling rejects a changed message after the catalog was loaded', async () => {
		await writeSource('vs/nls.ts', `export function localize(key: string, message: string) { return message; }`);
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; export const label = localize('a', 'First');`);
		const catalog = await extractNLSCatalog(sourceDir);
		await writeSource('vs/entry.ts', `import { localize } from './nls.js'; export const label = localize('a', 'Changed');`);
		await assert.rejects(esbuild.build({
			...getBundleOptions(false, 'neutral'),
			entryPoints: [path.join(sourceDir, 'vs', 'entry.ts')],
			outfile: path.join(directory, 'bundle.js'),
			plugins: [nlsPlugin({ baseDir: sourceDir, catalog })],
			logLevel: 'silent',
		}), /Missing or changed entry/);
	});

	test('postprocessing rejects missing indices rather than leaving placeholders in bundles', () => {
		assert.throws(() => postProcessNLS(`localize("%%NLS:vs/module#missing%%", "Default");`, new Map(), false), /Unresolved placeholder/);
	});
});
