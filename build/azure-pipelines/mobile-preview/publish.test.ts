/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { load as parseYaml } from 'js-yaml';
import {
	mobilePreviewDirectory, mobilePreviewEntrypoints, mobilePreviewManifestName,
	mobilePreviewQuality, prepareMobilePreview, writeMobilePreviewManifest,
} from '../../next/mobilePreview.ts';
import { publishMobilePreview, validateMobilePreview, type MobilePreviewStorage } from './publish.ts';

const repository = path.resolve(import.meta.dirname, '../../..');
const execFileAsync = promisify(execFile);

async function fixture(t: TestContext, quality: 'insider' | 'dev' = 'insider') {
	const root = path.join(repository, '.build/mobile-preview-publish-tests', randomUUID());
	await fs.mkdir(root, { recursive: true });
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const directory = path.join(root, mobilePreviewDirectory);
	const release = await prepareMobilePreview(root, `${mobilePreviewDirectory}/out`);
	const write = async (file: string, contents: string) => {
		const target = path.join(directory, file);
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, contents);
	};
	for (const [file, content] of Object.entries({
		[mobilePreviewEntrypoints.workbench]: 'export const create = () => {};',
		[mobilePreviewEntrypoints.stylesheet]: '.mobile { display: block; }',
		[mobilePreviewEntrypoints.nls]: 'globalThis._VSCODE_NLS_MESSAGES = ["Mobile"];',
		'out/nls.keys.json': '[["vs/sessions/contrib/mobile/browser/example",["title"]]]',
		'out/nls.messages.json': '["Mobile"]',
		'out/nls.metadata.json': '{"keys":{},"messages":{}}',
		'out/LICENSE.txt': 'MIT',
		'out/ThirdPartyNotices.txt': 'Third party notices',
		'node_modules/library/runtime.js': 'export const value = 1;',
		'extensions/github-authentication/package.json': JSON.stringify({
			publisher: 'vscode', name: 'github-authentication', version: '1.0.0', browser: './dist/browser/extension.js',
		}),
		'extensions/github-authentication/dist/browser/extension.js': 'module.exports.activate = () => {};',
		'extensions/theme-defaults/package.json': JSON.stringify({
			publisher: 'vscode', name: 'theme-defaults', version: '1.0.0', contributes: { themes: [{ path: './themes/dark.json' }] },
		}),
		'extensions/theme-defaults/themes/dark.json': '{"colors":{}}',
		'extensions/theme-seti/package.json': JSON.stringify({
			publisher: 'vscode', name: 'vscode-theme-seti', version: '1.0.0', contributes: { iconThemes: [{ path: './icons/theme.json' }] },
		}),
		'extensions/theme-seti/icons/theme.json': '{"fonts":[{"src":[{"path":"seti.woff"}]}]}',
		'extensions/theme-seti/icons/seti.woff': 'font bytes',
	})) {
		await write(file, content);
	}
	const build = { quality, commit: '0123456789abcdef0123456789abcdef01234567', version: '1.0.0-insider', date: '2026-10-05T00:00:00Z' };
	const manifest = await writeMobilePreviewManifest(root, build, []);
	await release();
	const rewrite = (patch: Record<string, unknown>) => write(mobilePreviewManifestName, JSON.stringify({ ...manifest, ...patch }));
	return { root, directory, manifest, write, rewrite };
}

class FakeStorage implements MobilePreviewStorage {
	readonly blobs = new Map<string, Buffer>();
	readonly created: string[] = [];
	readonly reads: string[] = [];
	readonly encodings = new Map<string, string | undefined>();
	readonly headers = new Map<string, Parameters<MobilePreviewStorage['create']>[2]>();
	failAt: number | undefined;
	race: 'same' | 'different' | undefined;

	async read(name: string): ReturnType<MobilePreviewStorage['read']> {
		this.reads.push(name);
		const contents = this.blobs.get(name);
		if (!contents) {
			return undefined;
		}
		const headers = this.headers.get(name);
		return { contents, contentType: headers?.contentType, contentEncoding: headers?.contentEncoding, cacheControl: headers?.cacheControl };
	}

	async create(name: string, contents: Buffer, options: Parameters<MobilePreviewStorage['create']>[2]): Promise<void> {
		assert.deepStrictEqual({
			condition: options.ifNoneMatch,
			cache: options.cacheControl,
			hash: options.sha256,
		}, {
			condition: '*',
			cache: 'public, max-age=31536000, immutable',
			hash: createHash('sha256').update(contents).digest('hex'),
		});
		assert.ok(options.contentType.length > 0);
		if (this.failAt === this.created.length) {
			throw new Error('Simulated upload failure');
		}
		if (this.race) {
			this.blobs.set(name, this.race === 'same' ? contents : Buffer.from('different concurrent upload'));
			this.headers.set(name, options);
			this.race = undefined;
		}
		if (this.blobs.has(name)) {
			throw Object.assign(new Error('Blob already exists'), { statusCode: 412 });
		}
		this.blobs.set(name, Buffer.from(contents));
		this.encodings.set(name, options.contentEncoding);
		this.headers.set(name, options);
		this.created.push(name);
	}
}

suite('immutable mobile preview publishing', () => {
	test('validates exact manifest bytes and uses a separate digest-addressed CDN namespace', async t => {
		const { directory, write } = await fixture(t);
		const preview = await validateMobilePreview(directory);
		await write(mobilePreviewManifestName, preview.manifestBytes.toString() + ' ');
		const second = await validateMobilePreview(directory);
		assert.deepStrictEqual({
			first: preview.digest,
			second: second.digest,
			url: preview.url,
		}, {
			first: createHash('sha256').update(preview.manifestBytes).digest('hex'),
			second: createHash('sha256').update(preview.manifestBytes.toString() + ' ').digest('hex'),
			url: `https://main.vscode-cdn.net/agents/mobile/${preview.digest}/mobile-preview.json`,
		});
		assert.notEqual(preview.digest, second.digest);
	});

	test('uploads only listed assets, then the manifest, without normal inventory or latest writes', async t => {
		const { directory, manifest, write } = await fixture(t);
		await write('not-for-upload.txt', 'unlisted root file');
		const storage = new FakeStorage();
		const result = await publishMobilePreview(directory, storage);
		assert.deepStrictEqual(storage.created, [
			...manifest.assets.map(asset => `agents/mobile/${result.digest}/${asset.path}`),
			`agents/mobile/${result.digest}/mobile-preview.json`,
		]);
		const count = storage.created.length;
		assert.deepStrictEqual(await publishMobilePreview(directory, storage), result);
		assert.equal(storage.created.length, count, 'Identical releases are idempotent, not overwritten');
	});

	test('a failed partial upload never publishes a manifest, and a retry can finish safely', async t => {
		const { directory, manifest } = await fixture(t);
		const storage = new FakeStorage();
		storage.failAt = 2;
		await assert.rejects(publishMobilePreview(directory, storage), /Simulated upload failure/);
		assert.deepStrictEqual({
			created: storage.created.length,
			manifests: [...storage.blobs.keys()].filter(name => name.endsWith('/mobile-preview.json')),
		}, { created: 2, manifests: [] });
		storage.failAt = undefined;
		const result = await publishMobilePreview(directory, storage);
		assert.deepStrictEqual({
			created: storage.created.length,
			last: storage.created.at(-1),
		}, { created: manifest.assets.length + 1, last: `agents/mobile/${result.digest}/mobile-preview.json` });
	});

	test('precompresses runtime assets but publishes the exact raw manifest bytes', async t => {
		const { directory, manifest } = await fixture(t);
		const storage = new FakeStorage();
		const result = await publishMobilePreview(directory, storage);
		const prefix = `agents/mobile/${result.digest}/`;
		assert.deepStrictEqual({
			assets: manifest.assets.map(asset => {
				const blob = storage.blobs.get(prefix + asset.path)!;
				const contents = storage.encodings.get(prefix + asset.path) === 'gzip' ? gunzipSync(blob) : blob;
				return { path: asset.path, hash: createHash('sha256').update(contents).digest('hex') };
			}),
			javascriptEncoding: storage.encodings.get(prefix + manifest.entrypoints.workbench),
			manifestEncoding: storage.encodings.get(prefix + mobilePreviewManifestName),
			manifest: storage.blobs.get(prefix + mobilePreviewManifestName),
		}, {
			assets: manifest.assets.map(asset => ({ path: asset.path, hash: asset.sha256 })),
			javascriptEncoding: 'gzip',
			manifestEncoding: undefined,
			manifest: await fs.readFile(path.join(directory, mobilePreviewManifestName)),
		});
	});

	for (const location of ['asset', 'manifest'] as const) {
		test(`refuses a differing immutable ${location} without overwriting it`, async t => {
			const { directory, manifest } = await fixture(t);
			const preview = await validateMobilePreview(directory);
			const name = `agents/mobile/${preview.digest}/${location === 'asset' ? manifest.assets[0].path : mobilePreviewManifestName}`;
			const storage = new FakeStorage();
			storage.blobs.set(name, Buffer.from('existing different bytes'));
			await assert.rejects(publishMobilePreview(directory, storage), /Refusing to overwrite differing immutable/);
			assert.deepStrictEqual({ created: storage.created, contents: storage.blobs.get(name)?.toString() }, {
				created: [], contents: 'existing different bytes',
			});
		});
	}

	test('conditional creates handle concurrent identical uploads but reject differing ones', async t => {
		const { directory } = await fixture(t);
		const identical = new FakeStorage();
		identical.race = 'same';
		await publishMobilePreview(directory, identical);
		const different = new FakeStorage();
		different.race = 'different';
		await assert.rejects(publishMobilePreview(directory, different), /Refusing to overwrite differing immutable/);
		assert.deepStrictEqual(different.created, []);
	});

	test('matching bytes with incorrect content headers are not accepted as a completed release', async t => {
		const { directory, manifest } = await fixture(t);
		const storage = new FakeStorage();
		const result = await publishMobilePreview(directory, storage);
		const name = `agents/mobile/${result.digest}/${manifest.entrypoints.workbench}`;
		storage.headers.set(name, { ...storage.headers.get(name)!, contentEncoding: undefined });
		const count = storage.created.length;
		await assert.rejects(publishMobilePreview(directory, storage), /differing immutable mobile preview blob or headers/);
		assert.equal(storage.created.length, count);
	});

	test('validates all hashes before making any storage request', async t => {
		const { directory, manifest, write } = await fixture(t);
		await write(manifest.assets.at(-1)!.path, 'corrupted bytes');
		const storage = new FakeStorage();
		await assert.rejects(publishMobilePreview(directory, storage), /Asset (size|hash) mismatch/);
		assert.deepStrictEqual({ reads: storage.reads, writes: storage.created }, { reads: [], writes: [] });
	});

	test('development quality is valid locally but never publishable', async t => {
		const { directory } = await fixture(t, 'dev');
		await validateMobilePreview(directory);
		const storage = new FakeStorage();
		await assert.rejects(publishMobilePreview(directory, storage), /Development-quality/);
		assert.deepStrictEqual(storage.reads, []);
	});

	test('requires the schema, identity, quality, entrypoints, budgets, and extension inventory', async t => {
		const { directory, manifest, rewrite } = await fixture(t);
		for (const patch of [
			{ schemaVersion: 1 },
			{ kind: 'workbench' },
			{ build: { ...manifest.build, quality: undefined } },
			{ build: { ...manifest.build, quality: 'preview' } },
			{ build: { ...manifest.build, commit: 'branch' } },
			{ build: { ...manifest.build, date: 'yesterday' } },
			{ build: { ...manifest.build, date: '2026-02-31T00:00:00Z' } },
			{ build: { ...manifest.build, version: '' } },
			{ entrypoints: { ...manifest.entrypoints, workbench: 'https://example.invalid/main.js' } },
			{ preload: [] },
			{ localization: {} },
			{ budgets: { ...manifest.budgets, runtimeGzipBytes: manifest.budgets.runtimeGzipBytes + 1 } },
			{ extensions: undefined },
			{ extensions: [] },
			{ extensions: [manifest.extensions[0], manifest.extensions[0]] },
			{ sizes: { ...manifest.sizes, extensionsGzipBytes: 0 } },
			{ contributions: ['src/vs/workbench/workbench.web.main.ts'] },
		]) {
			await rewrite(patch);
			await assert.rejects(validateMobilePreview(directory));
		}
	});

	test('rejects traversal, URL escapes, duplicate assets, and invalid hashes or sizes', async t => {
		const { directory, manifest, rewrite } = await fixture(t);
		const first = manifest.assets[0];
		for (const badPath of ['/absolute.js', '../escape.js', 'out/../escape.js', 'out//file.js', 'out\\file.js', 'out/%2e%2e/escape.js', 'out/file.js?query', 'out/file.js#fragment', 'https://example.invalid/file.js', 'private/file.js']) {
			await rewrite({ assets: [{ ...first, path: badPath }, ...manifest.assets.slice(1)] });
			await assert.rejects(validateMobilePreview(directory), /path|outside/);
		}
		for (const patch of [{ sha256: 'invalid' }, { sha256: '0'.repeat(64) }, { bytes: -1 }, { gzipBytes: first.gzipBytes + 1 }]) {
			await rewrite({ assets: [{ ...first, ...patch }, ...manifest.assets.slice(1)] });
			await assert.rejects(validateMobilePreview(directory), /hash|size/);
		}
		await rewrite({ assets: [...manifest.assets, first] });
		await assert.rejects(validateMobilePreview(directory), /Duplicate mobile preview asset/);
	});

	test('rejects missing required files, extra unlisted extension files, and an active writer', async t => {
		const { directory, manifest, write, rewrite } = await fixture(t);
		await rewrite({ assets: manifest.assets.filter(asset => asset.path !== 'out/LICENSE.txt') });
		await assert.rejects(validateMobilePreview(directory), /Unlisted mobile preview asset/);
		await rewrite({});
		await write('extensions/theme-seti/unlisted.json', '{}');
		await assert.rejects(validateMobilePreview(directory), /Unlisted mobile preview asset/);
		await fs.rm(path.join(directory, 'extensions/theme-seti/unlisted.json'));
		await write('.mobile-preview-build.lock', '123');
		await assert.rejects(validateMobilePreview(directory), /still being built/);
	});

	test('refuses an asset symlink or symlinked ancestor', { skip: process.platform === 'win32' ? 'Symlinks require elevated privileges' : false }, async t => {
		const { root, directory } = await fixture(t);
		const browser = path.join(directory, 'extensions/github-authentication/dist/browser');
		const moved = path.join(root, 'browser');
		await fs.rename(browser, moved);
		await fs.symlink(moved, browser, 'dir');
		await assert.rejects(validateMobilePreview(directory), /Symlinks are not allowed/);
	});

	test('a moved artifact validates and the CLI defaults to a credential-free dry run', async t => {
		const { root, directory } = await fixture(t);
		const expected = await validateMobilePreview(directory);
		const relocated = path.join(root, 'relocated/artifact');
		await fs.cp(directory, relocated, { recursive: true });
		await fs.rm(directory, { recursive: true });
		const { stdout } = await execFileAsync(process.execPath, [path.join(import.meta.dirname, 'publish.ts'), '--artifact', relocated], {
			cwd: path.dirname(relocated),
			env: { ...process.env, AZURE_STORAGE_ACCOUNT: '', AZURE_TENANT_ID: '', AZURE_CLIENT_ID: '', AZURE_ID_TOKEN: '' },
		});
		assert.deepStrictEqual(JSON.parse(stdout), {
			mode: 'dry-run', release: expected.digest, manifestUrl: expected.url,
			quality: 'insider', assets: expected.manifest.assets.length,
			bytes: expected.manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0), sizes: expected.manifest.sizes,
		});
	});

	test('the official product mixin supplies each supported release quality', async t => {
		const { root } = await fixture(t);
		await fs.writeFile(path.join(root, 'product.json'), '{"builtInExtensions":[]}');
		const qualities = ['insider', 'stable', 'exploration'];
		const results: string[] = [];
		for (const quality of qualities) {
			const mixin = path.join(root, '.build/distro/mixin', quality);
			await fs.mkdir(mixin, { recursive: true });
			await fs.writeFile(path.join(mixin, 'product.json'), JSON.stringify({ quality }));
			await execFileAsync(process.execPath, [path.join(repository, 'build/azure-pipelines/distro/mixin-quality.ts')], {
				cwd: root,
				env: { ...process.env, VSCODE_QUALITY: quality },
			});
			const product: { quality?: string } = JSON.parse(await fs.readFile(path.join(root, 'product.json'), 'utf8'));
			results.push(mobilePreviewQuality(product.quality, quality));
		}
		assert.deepStrictEqual(results, qualities);
	});

	test('the manual pipeline applies pinned product quality before building and disables publishing by default', async () => {
		const text = await fs.readFile(path.join(import.meta.dirname, '../mobile-preview.yml'), 'utf8');
		const pipeline = parseYaml(text) as {
			trigger: string;
			pr: string;
			parameters: { name: string; default: unknown; values?: string[] }[];
			variables: { VSCODE_QUALITY: string };
			resources: { repositories: { repository: string; name: string }[] };
			extends: { parameters: { stages: { jobs: { steps: { checkout?: string; path?: string; bash?: string }[] }[] }[] } };
		};
		const quality = pipeline.parameters.find(parameter => parameter.name === 'VSCODE_QUALITY');
		const steps = pipeline.extends.parameters.stages[0].jobs[0].steps;
		const mixinIndex = steps.findIndex(step => step.bash?.includes('node build/azure-pipelines/distro/mixin-quality.ts'));
		const buildIndex = steps.findIndex(step => step.bash?.includes('npm run bundle-mobile-preview'));
		assert.deepStrictEqual({
			trigger: pipeline.trigger, pr: pipeline.pr,
			publish: pipeline.parameters.find(parameter => parameter.name === 'MOBILE_PREVIEW_PUBLISH')?.default,
			qualityDefault: quality?.default,
			qualities: quality?.values,
			qualityVariable: pipeline.variables.VSCODE_QUALITY,
			distro: pipeline.resources.repositories.find(repository => repository.repository === 'distro')?.name,
			distroPath: steps.find(step => step.checkout === 'distro')?.path,
			pinnedDistro: steps[mixinIndex]?.bash?.includes('require(\'./package.json\').distro'),
			mixinBeforeBuild: mixinIndex >= 0 && buildIndex > mixinIndex,
		}, {
			trigger: 'none', pr: 'none', publish: false,
			qualityDefault: 'insider', qualities: ['insider', 'stable', 'exploration'],
			qualityVariable: '${{ parameters.VSCODE_QUALITY }}',
			distro: 'microsoft/vscode-distro', distroPath: 's/.build/distro',
			pinnedDistro: true, mixinBeforeBuild: true,
		});
		assert.ok(text.includes('${{ if eq(parameters.MOBILE_PREVIEW_PUBLISH, true) }}'));
		assert.ok(text.includes('npm run validate-mobile-preview'));
		assert.ok(!/upload-cdn\.ts|files\.txt|latest|product-publish\.yml/.test(text));
	});
});
