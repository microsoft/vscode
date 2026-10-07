/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { gzipSync } from 'node:zlib';
import mime from 'mime';
import {
	checkMobilePreviewBudgets, checkMobilePreviewDependencies, checkMobilePreviewPath,
	mobilePreviewDirectory, mobilePreviewEntrypoints, mobilePreviewManifestName, mobilePreviewQuality,
	readMobilePreviewExtensions, readMobilePreviewFile, type MobilePreviewManifest,
} from '../../next/mobilePreview.ts';
import policy from '../../next/mobilePreviewPolicy.json' with { type: 'json' };

const cdnRoot = 'https://main.vscode-cdn.net/agents/mobile';
const requiredExtensions = ['vscode.github-authentication', 'vscode.theme-defaults', 'vscode.vscode-theme-seti'];

export interface MobilePreviewStorage {
	/** Read stored blob bytes without transparently decompressing Content-Encoding. */
	read(name: string): Promise<{
		readonly contents: Buffer;
		readonly contentType?: string;
		readonly contentEncoding?: string;
		readonly cacheControl?: string;
	} | undefined>;
	/** Must create atomically with If-None-Match: *, never overwrite an existing blob. */
	create(name: string, contents: Buffer, options: {
		readonly sha256: string;
		readonly contentType: string;
		readonly contentEncoding?: 'gzip';
		readonly cacheControl: string;
		readonly ifNoneMatch: '*';
	}): Promise<void>;
}

interface ValidatedMobilePreview {
	readonly manifest: MobilePreviewManifest;
	readonly manifestBytes: Buffer;
	readonly digest: string;
	readonly url: string;
	readonly contents: ReadonlyMap<string, Buffer>;
}

function sha256(contents: Buffer): string {
	return createHash('sha256').update(contents).digest('hex');
}

async function checkNotBuilding(directory: string): Promise<void> {
	try {
		await fs.lstat(path.join(directory, '.mobile-preview-build.lock'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return;
		}
		throw error;
	}
	throw new Error('Mobile preview is still being built; refusing to publish a partial generation');
}

/** Validate everything before the first storage operation, and retain exactly the bytes verified. */
export async function validateMobilePreview(directory: string): Promise<ValidatedMobilePreview> {
	directory = path.resolve(directory);
	await checkNotBuilding(directory);
	const manifestBytes = await readMobilePreviewFile(directory, mobilePreviewManifestName);
	const manifest = JSON.parse(manifestBytes.toString('utf8')) as MobilePreviewManifest;
	assert.ok(manifest && typeof manifest === 'object', 'Missing mobile preview manifest');
	assert.equal(manifest.schemaVersion, 2, 'Mobile preview schemaVersion must be 2; rebuild older previews');
	assert.equal(manifest.kind, 'sessions-mobile-preview', 'Invalid mobile preview kind');
	assert.ok(manifest.build && typeof manifest.build === 'object', 'Missing mobile preview build');
	assert.match(manifest.build.commit, /^[0-9a-f]{40}$/, 'Invalid mobile preview commit');
	assert.match(manifest.build.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'Invalid mobile preview version');
	assert.match(manifest.build.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, 'Invalid mobile preview date');
	assert.ok(Number.isFinite(Date.parse(manifest.build.date)), 'Invalid mobile preview date');
	assert.equal(new Date(manifest.build.date).toISOString().replace('.000Z', 'Z'), manifest.build.date.replace('.000Z', 'Z'), 'Invalid mobile preview date');
	assert.equal(typeof manifest.build.quality, 'string', 'Missing mobile preview quality');
	mobilePreviewQuality(manifest.build.quality);
	assert.deepStrictEqual(manifest.entrypoints, mobilePreviewEntrypoints, 'Invalid mobile preview entrypoints');
	assert.deepStrictEqual(manifest.preload, Object.values(mobilePreviewEntrypoints), 'Invalid mobile preview preload');
	assert.deepStrictEqual(manifest.localization, {
		keys: 'out/nls.keys.json', messages: 'out/nls.messages.json', metadata: 'out/nls.metadata.json',
	}, 'Invalid mobile preview localization');
	assert.deepStrictEqual(manifest.budgets, policy.budgets, 'Mobile preview budgets must not be weakened');
	assert.ok(Array.isArray(manifest.contributions) && manifest.contributions.every(file => typeof file === 'string'), 'Missing mobile preview contributions');
	assert.deepStrictEqual(checkMobilePreviewDependencies(manifest.contributions), manifest.contributions, 'Invalid mobile preview contribution inventory');
	assert.ok(Array.isArray(manifest.assets) && manifest.assets.length > 0, 'Missing mobile preview assets');
	assert.ok(Array.isArray(manifest.extensions) && manifest.extensions.length > 0, 'Missing mobile preview extensions');

	const contents = new Map<string, Buffer>();
	for (const asset of manifest.assets) {
		assert.ok(asset && typeof asset.path === 'string', 'Invalid mobile preview asset');
		checkMobilePreviewPath(asset.path);
		assert.match(asset.path, /^(?:out|node_modules|extensions)\//, 'Asset is outside the mobile preview package');
		assert.ok(!contents.has(asset.path), `Duplicate mobile preview asset: ${asset.path}`);
		assert.ok(Number.isSafeInteger(asset.bytes) && asset.bytes >= 0 && Number.isSafeInteger(asset.gzipBytes) && asset.gzipBytes > 0, `Invalid asset size: ${asset.path}`);
		assert.match(asset.sha256, /^[0-9a-f]{64}$/, `Invalid asset hash: ${asset.path}`);
		const bytes = await readMobilePreviewFile(directory, asset.path);
		assert.equal(bytes.length, asset.bytes, `Asset size mismatch: ${asset.path}`);
		assert.equal(sha256(bytes), asset.sha256, `Asset hash mismatch: ${asset.path}`);
		assert.equal(gzipSync(bytes).length, asset.gzipBytes, `Asset gzip size mismatch: ${asset.path}`);
		contents.set(asset.path, bytes);
	}
	for (const prefix of ['out', 'node_modules', 'extensions']) {
		const root = path.join(directory, prefix);
		const stat = await fs.lstat(root);
		assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `Invalid mobile preview directory: ${prefix}`);
		for (const file of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
			assert.ok(!file.isSymbolicLink(), `Symlinks are not allowed in mobile preview assets: ${file.name}`);
			if (file.isFile()) {
				const relative = path.relative(directory, path.join(file.parentPath, file.name)).replaceAll('\\', '/');
				assert.ok(contents.has(relative), `Unlisted mobile preview asset: ${relative}`);
			} else {
				assert.ok(file.isDirectory(), `Not a regular mobile preview asset: ${file.name}`);
			}
		}
	}
	for (const file of [...Object.values(manifest.localization), 'out/LICENSE.txt', 'out/ThirdPartyNotices.txt']) {
		assert.ok(contents.has(file), `Missing required mobile preview asset: ${file}`);
	}
	const keys: [string, string[]][] = JSON.parse(contents.get(manifest.localization.keys)!.toString());
	const messages: string[] = JSON.parse(contents.get(manifest.localization.messages)!.toString());
	assert.ok(Array.isArray(keys) && keys.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && Array.isArray(entry[1]) && entry[1].every(key => typeof key === 'string')), 'Invalid mobile preview NLS keys');
	assert.ok(Array.isArray(messages) && messages.every(message => typeof message === 'string'), 'Invalid mobile preview NLS messages');
	assert.equal(keys.reduce((count, [, entries]) => count + entries.length, 0), messages.length, 'Mobile preview NLS keys and messages must match');
	assert.ok(keys.some(([module]) => module.startsWith('vs/sessions/contrib/mobile/')), 'Mobile preview NLS must include mobile messages');
	assert.deepStrictEqual(manifest.sizes, checkMobilePreviewBudgets(manifest.assets), 'Mobile preview sizes do not match assets');
	assert.deepStrictEqual(manifest.extensions, await readMobilePreviewExtensions(directory, new Set(contents.keys()), async file => {
		const bytes = contents.get(file);
		assert.ok(bytes, `Missing mobile preview extension resource: ${file}`);
		return bytes;
	}), 'Mobile preview extension inventory does not match packaged manifests');
	for (const id of requiredExtensions) {
		assert.ok(manifest.extensions.some(extension => extension.id === id), `Missing required mobile preview extension: ${id}`);
	}
	const authentication = manifest.extensions.find(extension => extension.id === 'vscode.github-authentication')!;
	const authManifest: { browser?: string } = JSON.parse(contents.get(`${authentication.path}/package.json`)!.toString());
	assert.ok(authManifest.browser, 'GitHub authentication requires a packaged browser entry');
	await checkNotBuilding(directory);
	assert.ok(manifestBytes.equals(await readMobilePreviewFile(directory, mobilePreviewManifestName)), 'Mobile preview generation changed during validation');
	const digest = sha256(manifestBytes);
	return { manifest, manifestBytes, contents, digest, url: `${cdnRoot}/${digest}/${mobilePreviewManifestName}` };
}

function isCollision(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}
	const statusCode = (error as { statusCode?: number }).statusCode;
	return statusCode === 409 || statusCode === 412;
}

async function createImmutable(storage: MobilePreviewStorage, name: string, rawContents: Buffer, compress = false): Promise<void> {
	const contentType = name.endsWith('.code-snippets') ? 'application/json' : mime.lookup(name);
	// Precompress large runtime bundles, as the normal CDN publisher does. They can
	// exceed the CDN's on-the-fly compression size limit.
	const contentEncoding = compress && /^(?:text\/|application\/(?:javascript|json|wasm)$|image\/svg\+xml$|font\/ttf$)/.test(contentType) ? 'gzip' : undefined;
	const contents = contentEncoding ? gzipSync(rawContents) : rawContents;
	const cacheControl = 'public, max-age=31536000, immutable';
	const compare = (existing: NonNullable<Awaited<ReturnType<MobilePreviewStorage['read']>>>) => {
		assert.ok(existing.contents.equals(contents) && existing.contentType === contentType &&
			existing.contentEncoding === contentEncoding && existing.cacheControl === cacheControl,
			`Refusing to overwrite differing immutable mobile preview blob or headers: ${name}`);
	};
	const existing = await storage.read(name);
	if (existing) {
		compare(existing);
		return;
	}
	try {
		await storage.create(name, contents, {
			sha256: sha256(contents),
			contentType,
			contentEncoding,
			cacheControl,
			ifNoneMatch: '*',
		});
	} catch (error) {
		if (!isCollision(error)) {
			throw error;
		}
		const concurrent = await storage.read(name);
		if (!concurrent) {
			throw error;
		}
		compare(concurrent);
	}
}

export async function publishMobilePreview(directory: string, storage: MobilePreviewStorage): Promise<{ digest: string; url: string }> {
	return publishValidatedMobilePreview(await validateMobilePreview(directory), storage);
}

async function publishValidatedMobilePreview(preview: ValidatedMobilePreview, storage: MobilePreviewStorage): Promise<{ digest: string; url: string }> {
	assert.notEqual(preview.manifest.build.quality, 'dev', 'Development-quality mobile previews cannot be published to the production CDN');
	const prefix = `agents/mobile/${preview.digest}`;
	const manifestPath = `${prefix}/${mobilePreviewManifestName}`;
	const existingManifest = await storage.read(manifestPath);
	assert.ok(!existingManifest || existingManifest.contents.equals(preview.manifestBytes), `Refusing to overwrite differing immutable mobile preview manifest: ${manifestPath}`);
	for (const [file, bytes] of preview.contents) {
		await createImmutable(storage, `${prefix}/${file}`, bytes, true);
	}
	// Never expose a release until every validated asset has been stored successfully.
	await createImmutable(storage, manifestPath, preview.manifestBytes);
	return { digest: preview.digest, url: preview.url };
}

async function azureStorage(): Promise<MobilePreviewStorage> {
	const requireEnv = (name: string) => {
		const value = process.env[name];
		assert.ok(value, `Missing required environment variable: ${name}`);
		return value;
	};
	const account = requireEnv('AZURE_STORAGE_ACCOUNT');
	assert.equal(account, 'vscodeweb', 'Mobile previews must use the storage account behind main.vscode-cdn.net');
	const tenant = requireEnv('AZURE_TENANT_ID');
	const client = requireEnv('AZURE_CLIENT_ID');
	const token = requireEnv('AZURE_ID_TOKEN');
	const { ClientAssertionCredential } = await import('@azure/identity');
	const { BlobServiceClient } = await import('@azure/storage-blob');
	const credential = new ClientAssertionCredential(tenant, client, () => Promise.resolve(token));
	const container = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient('$web');
	return {
		async read(name) {
			try {
				const blob = container.getBlockBlobClient(name);
				const properties = await blob.getProperties();
				assert.ok(properties.etag, `Missing ETag for immutable mobile preview blob: ${name}`);
				return {
					contents: await blob.downloadToBuffer(0, undefined, { conditions: { ifMatch: properties.etag } }),
					contentType: properties.contentType,
					contentEncoding: properties.contentEncoding,
					cacheControl: properties.cacheControl,
				};
			} catch (error) {
				if ((error as { statusCode?: number }).statusCode === 404) {
					return undefined;
				}
				throw error;
			}
		},
		async create(name, contents, options) {
			await container.getBlockBlobClient(name).uploadData(contents, {
				conditions: { ifNoneMatch: options.ifNoneMatch },
				metadata: { sha256: options.sha256 },
				blobHTTPHeaders: { blobContentType: options.contentType, blobContentEncoding: options.contentEncoding, blobCacheControl: options.cacheControl },
			});
		},
	};
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	let directory = mobilePreviewDirectory;
	let publish = false;
	let dryRun = false;
	for (let index = 0; index < args.length; index++) {
		switch (args[index]) {
			case '--artifact':
				assert.ok(args[index + 1] && !args[index + 1].startsWith('--'), '--artifact requires a directory');
				directory = args[++index];
				break;
			case '--publish':
				publish = true;
				break;
			case '--dry-run':
				dryRun = true;
				break;
			default:
				throw new Error(`Unknown mobile preview publishing option: ${args[index]}`);
		}
	}
	assert.ok(!publish || !dryRun, 'Choose either --publish or --dry-run');
	const preview = await validateMobilePreview(directory);
	if (publish) {
		assert.notEqual(preview.manifest.build.quality, 'dev', 'Development-quality mobile previews cannot be published to the production CDN');
		await publishValidatedMobilePreview(preview, await azureStorage());
	}
	console.log(JSON.stringify({
		mode: publish ? 'published' : 'dry-run',
		release: preview.digest,
		manifestUrl: preview.url,
		quality: preview.manifest.build.quality,
		assets: preview.manifest.assets.length,
		bytes: preview.manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
		sizes: preview.manifest.sizes,
	}, null, '\t'));
}

if (import.meta.filename === process.argv[1]) {
	main().catch(error => {
		console.error(error);
		process.exitCode = 1;
	});
}
