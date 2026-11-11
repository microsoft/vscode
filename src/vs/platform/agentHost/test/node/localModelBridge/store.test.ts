/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeContentId } from '../../../node/copilot/localModelBridge/shim/modelCatalog.js';
import { checkDiskSpace, LocalModelStore, LocalModelStoreError, requiredDiskBytes, toCatalogInstallFact, type IStoreFileSystem } from '../../../node/copilot/localModelBridge/shim/store.js';

const ASSET = 'MAI-Code-1.1-Flash';
const FILES = { 'MAI-Code-1.1-Flash-Q2-XS.gguf': 'primary-weights', 'dflash-v3-lc1.gguf': 'draft-weights', 'llama-default.ini': 'version = 1\n' };
const ARGS = ['--spec-type', 'draft-dflash', '--jinja'];

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

function createStorage() {
	const data = new Map<string, unknown>();
	return { data, get: <T>(key: string) => data.get(key) as T | undefined, set: <T>(key: string, value: T) => { data.set(key, value); } };
}

async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
	await fs.promises.mkdir(dir, { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		await fs.promises.writeFile(path.join(dir, name), content);
	}
}

function manifestFiles(files: Record<string, string>) {
	return Object.entries(files).map(([name, content]) => ({ path: name, totalBytes: Buffer.byteLength(content), sha256: sha256(content), etag: `"etag-${name}"` }));
}

async function readJson(file: string): Promise<unknown> {
	return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

async function exists(file: string): Promise<boolean> {
	try {
		await fs.promises.access(file);
		return true;
	} catch {
		return false;
	}
}

/** Compares two paths after resolving links (temp directories may be 8.3 short names on Windows). */
async function samePathForTest(a: string, b: string): Promise<boolean> {
	return path.relative(await fs.promises.realpath(a), await fs.promises.realpath(b)) === '';
}

suite('localModel store', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let home: string;
	setup(async () => {
		home = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-store-'));
	});
	teardown(async () => {
		await fs.promises.rm(home, { recursive: true, force: true });
	});

	function createStore(options: { fileSystem?: IStoreFileSystem; storage?: ReturnType<typeof createStorage>; log?: { warn(message: string): void } } = {}) {
		return new LocalModelStore({ copilotHome: home, now: () => Date.UTC(2026, 9, 7), ...options });
	}

	async function installOwned(store: LocalModelStore, version: string, activate = true) {
		const versionDir = await store.beginVersion('azureml', ASSET, version, 'mai-code-1.1-flash-local');
		await writeFiles(versionDir, FILES);
		return store.commitVersion({
			registry: 'azureml', assetName: ASSET, version, primaryFile: 'MAI-Code-1.1-Flash-Q2-XS.gguf', files: manifestFiles(FILES),
			ctxSize: 262144, parallel: 1, args: ARGS, displayName: 'Example Flash 1.0', capiId: 'mai-code-1.1-flash-local', autoCapable: true, activate,
		});
	}

	async function installForeign(version: string, files: Record<string, string> = FILES, activeOverrides: Record<string, unknown> = {}, manifestOverrides: Record<string, unknown> = {}) {
		const familyDir = path.join(home, 'azureml-models', 'azureml', ASSET);
		const versionDir = path.join(familyDir, version);
		await writeFiles(versionDir, files);
		const manifestPath = path.join(versionDir, 'manifest.json');
		const primaryPath = path.join(versionDir, 'MAI-Code-1.1-Flash-Q2-XS.gguf');
		await fs.promises.writeFile(manifestPath, JSON.stringify({ assetId: `azureml://registries/azureml/models/${ASSET}/versions/${version}`, registry: 'azureml', name: ASSET, version, primaryPath, totalBytes: 1, serveOptions: { ctxSize: 262144, parallel: 1, args: [] }, maxConcurrent: 1, files: manifestFiles(FILES), extraFiles: [], ...manifestOverrides }));
		await fs.promises.writeFile(path.join(familyDir, 'active.json'), JSON.stringify({ version, primaryPath, manifestPath, registration: { model: { autoLocal: { capiId: 'mai-code-1.1-flash-local' } } }, ...activeOverrides }));
		return { familyDir, versionDir };
	}

	test('golden manifest.json, active.json and .vscode-owner.json (the layout the Copilot CLI reads)', async () => {
		const store = createStore();
		const installed = await installOwned(store, '3');
		const familyDir = path.join(home, 'azureml-models', 'azureml', ASSET);
		const versionDir = path.join(familyDir, '3');
		const primaryPath = path.join(versionDir, 'MAI-Code-1.1-Flash-Q2-XS.gguf');
		const manifestPath = path.join(versionDir, 'manifest.json');
		assert.deepStrictEqual({
			manifest: await readJson(manifestPath),
			active: await readJson(path.join(familyDir, 'active.json')),
			owner: await readJson(path.join(familyDir, '.vscode-owner.json')),
			installed: { owned: installed.owned, adopted: installed.adopted, capiId: installed.capiId, contentIdLength: installed.contentId.length },
			noPendingLeft: (await fs.promises.readdir(versionDir)).filter(name => name.endsWith('.pending')),
		}, {
			manifest: {
				assetId: `azureml://registries/azureml/models/${ASSET}/versions/3`,
				registry: 'azureml',
				name: ASSET,
				version: '3',
				primaryPath,
				totalBytes: 15 + 13 + 12,
				serveOptions: { ctxSize: 262144, parallel: 1, args: ARGS },
				maxConcurrent: 1,
				files: manifestFiles(FILES),
				extraFiles: ['dflash-v3-lc1.gguf', 'llama-default.ini'],
			},
			active: {
				version: '3',
				primaryPath,
				manifestPath,
				registration: {
					provider: { name: `winml-azureml-${ASSET}`, type: 'winml', baseUrl: primaryPath, localModel: { modelPath: primaryPath, manifestPath, ctxSize: 262144, parallel: 1 } },
					model: { id: ASSET, provider: `winml-azureml-${ASSET}`, name: 'Example Flash 1.0 (local)', autoLocal: { capiId: 'mai-code-1.1-flash-local', maxConcurrent: 1 } },
				},
				descriptor: { assetId: `azureml://registries/azureml/models/${ASSET}/versions/3`, registry: 'azureml', name: ASSET, version: '3', primaryPath, manifestPath, capiId: 'mai-code-1.1-flash-local' },
			},
			owner: { writer: 'vscode', versions: ['3'], writtenAt: '2026-10-07T00:00:00.000Z', capiId: 'mai-code-1.1-flash-local' },
			installed: { owned: true, adopted: false, capiId: 'mai-code-1.1-flash-local', contentIdLength: 64 },
			noPendingLeft: [],
		});
	});

	test('a foreign active.json capiId that is malformed (or carries a credential) falls back to the asset-derived id', async () => {
		const store = createStore();
		await installForeign('5', FILES, { registration: { model: { autoLocal: { capiId: 'model&sv=2024&sig=SECRET-local' } } } });
		const adopted = await store.selectServingVersion('azureml', ASSET);
		assert.deepStrictEqual({ adopted: adopted?.adopted, capiId: adopted?.capiId }, { adopted: true, capiId: 'mai-code-1.1-flash-local' });
	});

	test('review-15 (d): a manifest whose version or name is unsafe, signed or not its directory\'s is never served; identities come from the directory', async () => {
		const store = createStore();
		const familyDir = path.join(home, 'azureml-models', 'azureml', ASSET);
		const summary = (install: Awaited<ReturnType<LocalModelStore['selectServingVersion']>>) => install && { version: install.version, channelVersion: install.channelVersion, assetName: install.assetName, owned: install.owned };
		const foreign = async (manifestOverrides: Record<string, unknown>, activeOverrides: Record<string, unknown> = {}) => {
			await fs.promises.rm(path.join(home, 'azureml-models'), { recursive: true, force: true });
			await installForeign('5', FILES, activeOverrides, manifestOverrides);
			return summary(await store.selectServingVersion('azureml', ASSET));
		};
		const results = {
			matching: await foreign({}),
			signedVersion: await foreign({ version: '5?sv=2024&sig=SECRET' }),
			otherVersion: await foreign({ version: '6' }),
			otherName: await foreign({ name: 'Other-Model' }),
			signedAssetId: await foreign({ assetId: 'https://acct.blob.core.windows.net/c/m?sv=2024&sig=SECRET' }),
			encodedArg: await foreign({ serveOptions: { ctxSize: 1, parallel: 1, args: ['--x', 'y%26sig%3DSECRET'] } }),
			signedActiveVersion: await foreign({}, { version: '5?sig=SECRET' }),
		};
		await fs.promises.rm(path.join(home, 'azureml-models'), { recursive: true, force: true });
		await installOwned(store, '3');
		const manifestPath = path.join(familyDir, '3', 'manifest.json');
		const written = await readJson(manifestPath) as Record<string, unknown>;
		await fs.promises.writeFile(manifestPath, JSON.stringify({ ...written, version: '3?sv=2024&sig=SECRET' }));
		const ownedTampered = summary(await store.selectServingVersion('azureml', ASSET));
		assert.deepStrictEqual({ ...results, ownedTampered, installs: (await store.listInstalled()).length }, {
			matching: { version: '5', channelVersion: '5', assetName: ASSET, owned: false },
			signedVersion: undefined,
			otherVersion: undefined,
			otherName: undefined,
			signedAssetId: undefined,
			encodedArg: undefined,
			signedActiveVersion: undefined,
			ownedTampered: undefined,
			installs: 0,
		});
	});

	test('the adoption hash cache drops invalid or credential-bearing entries on read and never writes one', async () => {
		const storage = createStorage();
		const warnings: string[] = [];
		const store = createStore({ storage, log: { warn: message => warnings.push(message) } });
		storage.set('localModel.adoptionHashes', { 'C:/x?sv=2024&sig=SECRET|1|2': 'a'.repeat(64), 'C:/y|1|2': 'not-a-hash', 'C:/z|1|2': 'b'.repeat(64) });
		await installForeign('5');
		const adopted = await store.selectServingVersion('azureml', ASSET);
		const verified = adopted && await store.verifyAdoptedVersion(adopted);
		const cached = storage.data.get('localModel.adoptionHashes') as Record<string, string>;
		assert.deepStrictEqual({ verified, entries: Object.keys(cached).length, kept: cached['C:/z|1|2'], leaks: /SECRET|sig=|not-a-hash/.test(JSON.stringify(cached)), warnings: [...new Set(warnings)] }, {
			verified: true,
			entries: 1 + Object.keys(FILES).length,
			kept: 'b'.repeat(64),
			leaks: false,
			warnings: ['[LocalModel] Dropped 2 invalid or credential-bearing entries from localModel.adoptionHashes'],
		});
	});

	test('a foreign active.json is never overwritten; VS Code serves its own newest version', async () => {
		const store = createStore();
		const { familyDir } = await installForeign('2');
		const foreignActive = await fs.promises.readFile(path.join(familyDir, 'active.json'), 'utf8');
		await installOwned(store, '3');
		const serving = await store.selectServingVersion('azureml', ASSET);
		assert.deepStrictEqual({
			untouched: await fs.promises.readFile(path.join(familyDir, 'active.json'), 'utf8') === foreignActive,
			serving: [serving?.version, serving?.owned],
			takeOverForeignVersion: await store.beginVersion('azureml', ASSET, '2', 'x').then(() => 'taken', (error: LocalModelStoreError) => error.code),
		}, { untouched: true, serving: ['3', true], takeOverForeignVersion: 'storage' });
	});

	test('adoption validation: valid foreign install, outside paths, missing file, size mismatch, cached re-hash', async () => {
		const storage = createStorage();
		const store = createStore({ storage });
		const { versionDir } = await installForeign('5');
		const adopted = await store.selectServingVersion('azureml', ASSET);
		const verified = adopted ? await store.verifyAdoptedVersion(adopted) : false;
		const cacheEntries = Object.keys(storage.data.get('localModel.adoptionHashes') as object).length;
		const reselected = await store.selectServingVersion('azureml', ASSET);

		const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-outside-'));
		try {
			await writeFiles(outside, FILES);
			await fs.promises.writeFile(path.join(outside, 'manifest.json'), await fs.promises.readFile(path.join(versionDir, 'manifest.json')));
			await installForeign('5', FILES, { primaryPath: path.join(outside, 'MAI-Code-1.1-Flash-Q2-XS.gguf'), manifestPath: path.join(outside, 'manifest.json') });
			const outsidePaths = await store.selectServingVersion('azureml', ASSET);
			await installForeign('5', FILES, { primaryPath: 'MAI-Code-1.1-Flash-Q2-XS.gguf' });
			const relativePaths = await store.selectServingVersion('azureml', ASSET);
			await installForeign('5');
			await fs.promises.rm(path.join(versionDir, 'dflash-v3-lc1.gguf'));
			const missingFile = await store.selectServingVersion('azureml', ASSET);
			await installForeign('5', { ...FILES, 'dflash-v3-lc1.gguf': 'draft-weights-but-longer' });
			const sizeMismatch = await store.selectServingVersion('azureml', ASSET);
			await installForeign('5', { ...FILES, 'dflash-v3-lc1.gguf': 'draft-weightz' });
			await fs.promises.utimes(path.join(versionDir, 'dflash-v3-lc1.gguf'), new Date(2020, 0, 1), new Date(2020, 0, 1));
			const tampered = await store.selectServingVersion('azureml', ASSET);
			assert.deepStrictEqual({
				adopted: [adopted?.version, adopted?.owned, adopted?.adopted, adopted?.hashesVerified, adopted?.capiId],
				verified,
				cacheEntries,
				reselectedVerified: reselected?.hashesVerified,
				outsidePaths, relativePaths, missingFile, sizeMismatch,
				tampered: [tampered?.hashesVerified, tampered ? await store.verifyAdoptedVersion(tampered) : undefined],
			}, {
				adopted: ['5', false, true, false, 'mai-code-1.1-flash-local'],
				verified: true,
				cacheEntries: 3,
				reselectedVerified: true,
				outsidePaths: undefined, relativePaths: undefined, missingFile: undefined, sizeMismatch: undefined,
				tampered: [false, false],
			});
		} finally {
			await fs.promises.rm(outside, { recursive: true, force: true });
		}
	});

	test('adoption requires the manifest primary to be the validated active primary and a listed file inside the version', async () => {
		const storage = createStorage();
		const store = createStore({ storage });
		const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-local-model-outside-'));
		try {
			await writeFiles(outside, FILES);
			const { versionDir } = await installForeign('6');
			const primary = path.join(versionDir, 'MAI-Code-1.1-Flash-Q2-XS.gguf');
			const valid = await store.selectServingVersion('azureml', ASSET);
			const validPrimary = valid?.manifest.primaryPath;
			const verifiedValid = valid ? await store.verifyAdoptedVersion(valid) : undefined;
			const hashedPaths = Object.keys(storage.data.get('localModel.adoptionHashes') as object).map(key => path.basename(key.split('|')[0])).sort();

			await installForeign('6', FILES, {}, { primaryPath: path.join(outside, 'MAI-Code-1.1-Flash-Q2-XS.gguf') });
			const manifestPrimaryOutside = await store.selectServingVersion('azureml', ASSET);
			await installForeign('6', FILES, {}, { files: manifestFiles(FILES).filter(file => file.path !== 'MAI-Code-1.1-Flash-Q2-XS.gguf') });
			const primaryNotListed = await store.selectServingVersion('azureml', ASSET);
			await fs.promises.writeFile(path.join(path.dirname(versionDir), 'escape.gguf'), 'primary-weights');
			await installForeign('6', FILES, {}, { files: [...manifestFiles(FILES), { path: '../escape.gguf', totalBytes: 15, sha256: sha256('primary-weights'), etag: '' }] });
			const fileEscapes = await store.selectServingVersion('azureml', ASSET);
			await installForeign('6', FILES, {}, { primaryPath: path.join(versionDir, 'dflash-v3-lc1.gguf') });
			const primaryMismatch = await store.selectServingVersion('azureml', ASSET);
			assert.deepStrictEqual({
				valid: [validPrimary === undefined ? undefined : await samePathForTest(validPrimary, primary), verifiedValid],
				hashedPaths,
				manifestPrimaryOutside, primaryNotListed, fileEscapes, primaryMismatch,
			}, {
				valid: [true, true],
				hashedPaths: ['MAI-Code-1.1-Flash-Q2-XS.gguf', 'dflash-v3-lc1.gguf', 'llama-default.ini'],
				manifestPrimaryOutside: undefined, primaryNotListed: undefined, fileEscapes: undefined, primaryMismatch: undefined,
			});
		} finally {
			await fs.promises.rm(outside, { recursive: true, force: true });
		}
	});

	test('update and prune touch only owned versions; remove deletes owned files, partials and records', async () => {
		const store = createStore();
		const { familyDir } = await installForeign('1');
		await fs.promises.rm(path.join(familyDir, 'active.json'));
		await installOwned(store, '2');
		await installOwned(store, '3');
		const pruned = await store.pruneOwnedVersions('azureml', ASSET, ['3']);
		const afterPrune = (await fs.promises.readdir(familyDir)).sort();
		await fs.promises.writeFile(path.join(familyDir, '3', 'next.gguf.vscode.partial'), 'partial');
		await store.removeFamily('azureml', ASSET);
		const afterRemove = (await fs.promises.readdir(familyDir)).sort();
		await fs.promises.rm(path.join(familyDir, '1'), { recursive: true });
		await installOwned(store, '4');
		await store.removeFamily('azureml', ASSET);
		assert.deepStrictEqual({
			pruned,
			afterPrune,
			afterRemove,
			familyDirRemoved: !await exists(familyDir),
		}, {
			pruned: ['2'],
			afterPrune: ['.vscode-owner.json', '1', '3', 'active.json'],
			afterRemove: ['1'],
			familyDirRemoved: true,
		});
	});

	/** A version in another registry's folder: VS Code-owned with `owner`, else another tool's (with `active.json`). */
	async function installElsewhere(registry: string, assetName: string, version: string, owner: Record<string, unknown> | undefined, files: Record<string, string> = FILES): Promise<string> {
		const familyDir = path.join(home, 'azureml-models', registry, assetName);
		const versionDir = path.join(familyDir, version);
		await writeFiles(versionDir, files);
		const manifestPath = path.join(versionDir, 'manifest.json');
		const primaryPath = path.join(versionDir, 'MAI-Code-1.1-Flash-Q2-XS.gguf');
		await fs.promises.writeFile(manifestPath, JSON.stringify({ assetId: `azureml://registries/${registry}/models/${assetName}/versions/${version}`, registry, name: assetName, version, primaryPath, totalBytes: 1, serveOptions: { ctxSize: 262144, parallel: 1, args: [] }, maxConcurrent: 1, files: manifestFiles(files), extraFiles: [] }));
		if (owner) {
			await fs.promises.writeFile(path.join(familyDir, '.vscode-owner.json'), JSON.stringify({ writer: 'vscode', versions: [version], writtenAt: '2026-10-07T00:00:00.000Z', ...owner }));
		} else {
			await fs.promises.writeFile(path.join(familyDir, 'active.json'), JSON.stringify({ version, primaryPath, manifestPath }));
		}
		return familyDir;
	}

	test('another registry\'s folder is listed only for content VS Code recorded identical to a production version; nothing else there is listed or changed', async () => {
		const store = createStore();
		const contentId = computeContentId(manifestFiles(FILES).map(file => ({ path: file.path, sizeBytes: file.totalBytes, sha256: file.sha256 })));
		await installElsewhere('example-registry', ASSET, '5', { capiId: 'mai-code-1.1-flash-local', promotedTo: { registry: 'azureml', assetName: 'MAI-Code-1.1-Flash-On-Device', version: '1', contentId } });
		const mismatched = await installElsewhere('example-registry', 'Other-Coder', '2', { promotedTo: { registry: 'azureml', assetName: 'Other-Coder-On-Device', version: '1', contentId: 'f'.repeat(64) } });
		const foreign = await installElsewhere('example-registry', 'Foreign-Coder', '1', undefined);
		const tree = async () => [...await fs.promises.readdir(mismatched, { recursive: true }), ...await fs.promises.readdir(foreign, { recursive: true })].sort().join(',');
		const before = await tree();
		const listed = await store.listInstalled();
		assert.deepStrictEqual({
			listed: listed.map(install => `${install.registry}/${install.assetName}:${install.version}`),
			fact: listed[0] && toCatalogInstallFact(listed[0]),
			untouched: await tree() === before,
		}, {
			listed: [`example-registry/${ASSET}:5`],
			fact: { familyId: 'mai-code-1.1-flash-local', assetName: ASSET, contentId, channelVersion: '1', owned: true, adopted: false },
			untouched: true,
		});
	});

	test('a newer owned version that may not be listed doesn\'t hide an older one recorded identical to a production version', async () => {
		const store = createStore();
		const contentId = computeContentId(manifestFiles(FILES).map(file => ({ path: file.path, sizeBytes: file.totalBytes, sha256: file.sha256 })));
		const recorded = { capiId: 'mai-code-1.1-flash-local', promotedTo: { registry: 'azureml', assetName: 'MAI-Code-1.1-Flash-On-Device', version: '1', contentId } };
		await installElsewhere('example-registry', ASSET, '5', recorded);
		// Version 6 is complete and newer, but its content (another preset) was never recorded identical to a production version.
		await installElsewhere('example-registry', ASSET, '6', { ...recorded, versions: ['5', '6'] }, { ...FILES, 'llama-default.ini': 'version = 2\n' });
		const selected = await store.selectServingVersion('example-registry', ASSET);
		assert.deepStrictEqual({
			selected: selected && { version: selected.version, channelVersion: selected.channelVersion, contentId: selected.contentId },
			listed: (await store.listInstalled()).map(install => `${install.registry}/${install.assetName}:${install.version}`),
		}, {
			selected: { version: '5', channelVersion: '1', contentId },
			listed: [`example-registry/${ASSET}:5`],
		});
	});

	test('EBUSY/EPERM while removing → filesInUse', async () => {
		const busy: IStoreFileSystem = {
			rm: async () => { throw Object.assign(new Error('busy'), { code: 'EBUSY' }); },
			rename: (from, to) => fs.promises.rename(from, to),
			writeFile: (file, contents) => fs.promises.writeFile(file, contents),
		};
		await installOwned(createStore(), '3');
		const error = await createStore({ fileSystem: busy }).removeFamily('azureml', ASSET).then(() => undefined, (e: LocalModelStoreError) => e.code);
		assert.strictEqual(error, 'filesInUse');
	});

	test('disk preflight on the nearest existing ancestor (peakDiskBytes + 2 GB)', async () => {
		const stats = new Map<string, number>([['/', 1], ['/data', 2], ['/data/home', 2]]);
		const fakeFs = {
			stat: async (p: string) => {
				const dev = stats.get(p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, ''));
				if (dev === undefined) {
					throw new Error('ENOENT');
				}
				return { dev };
			},
			statfs: async () => ({ bavail: 100, bsize: 1024 * 1024 * 1024 }),
		};
		const target = path.posix.join('/data/home/.copilot/azureml-models/azureml', ASSET);
		const required = requiredDiskBytes(57_000_000_000);
		const enough = await checkDiskSpace(target, required, 'linux', fakeFs);
		const notEnough = await checkDiskSpace(target, requiredDiskBytes(120 * 1024 * 1024 * 1024), 'linux', fakeFs);
		assert.deepStrictEqual({
			required,
			enough: [enough.ok, enough.availableBytes, process.platform === 'win32' ? 'skip' : enough.volume],
			notEnough: notEnough.ok,
		}, {
			required: 59_147_483_648,
			enough: [true, 100 * 1024 * 1024 * 1024, process.platform === 'win32' ? 'skip' : '/data'],
			notEnough: false,
		});
	});

	test('disk preflight for a version subtracts what is already on disk (placed files and VS Code partials), never bookkeeping or other tools\' partials', async () => {
		const store = createStore();
		const versionDir = path.join(home, 'azureml-models', 'azureml', 'MAI-Code-1.1-Flash-On-Device', '1');
		await writeFiles(versionDir, {
			'MAI-Code-1.1-Flash-Q2-XS.gguf.vscode.partial': 'x'.repeat(1000),
			'MAI-Code-1.1-Flash-Q2-XS.gguf.vscode.partial.json': '{}',
			'dflash-v3-lc1.gguf': 'd'.repeat(200),
			'llama-config.json': '{}',
			'manifest.json.pending': 'p'.repeat(50),
			'other.gguf.partial': 'c'.repeat(300),
			'other.gguf.part': 'a'.repeat(400),
		});
		const onDisk = await store.bytesOnDisk('azureml', 'MAI-Code-1.1-Flash-On-Device', '1');
		const resumed = await store.checkDiskSpace('azureml', 'MAI-Code-1.1-Flash-On-Device', 5000, '1');
		const fresh = await store.checkDiskSpace('azureml', 'MAI-Code-1.1-Flash-On-Device', 5000);
		const missing = await store.bytesOnDisk('azureml', 'MAI-Code-1.1-Flash-On-Device', '2');
		assert.deepStrictEqual({ onDisk, resumedRequired: resumed.requiredBytes, freshRequired: fresh.requiredBytes, missing }, {
			onDisk: 1200,
			resumedRequired: requiredDiskBytes(3800),
			freshRequired: requiredDiskBytes(5000),
			missing: 0,
		});
	});
});
