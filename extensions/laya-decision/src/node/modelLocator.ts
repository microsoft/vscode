/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { ReadableStream as WebReadableStream } from 'stream/web';

/**
 * Files that make up an exported Laya ONNX bundle, relative to the bundle folder.
 * Mirrors `BUNDLE_FILES` of `@receptron/laya`.
 */
export const BUNDLE_FILES: readonly string[] = [
	'laya.onnx',
	'laya.onnx.data',
	'laya_config.json',
	'tokenizer/tokenizer.json',
	'tokenizer/tokenizer_config.json',
];

export interface ModelManifestFile {
	/** Path relative to the bundle folder; must be one of {@link BUNDLE_FILES}. */
	readonly path: string;
	/** Size in bytes. */
	readonly size: number;
	/** Lower-case hex SHA-256 of the file contents. */
	readonly sha256: string;
}

/**
 * Describes a published, checksummed model bundle.
 */
export interface ModelManifest {
	/** Stable identifier of this bundle version; used as the cache folder name. */
	readonly id: string;
	/** Base URL that the file paths are resolved against. */
	readonly baseUrl: string;
	readonly files: readonly ModelManifestFile[];
}

/**
 * The default model bundle that is downloaded on first use.
 *
 * Intentionally unset until the quantized bundle is published on VS Code infrastructure with
 * pinned checksums. Until then the model must be provided through the `laya.modelPath` setting.
 */
export const DEFAULT_MODEL_MANIFEST: ModelManifest | undefined = undefined;

export class ModelNotConfiguredError extends Error {
	constructor() {
		super('No Laya model is configured. Set "laya.modelPath" to a folder containing an exported Laya ONNX bundle.');
		this.name = 'ModelNotConfiguredError';
	}
}

/**
 * Throws if `dir` does not contain every file of the bundle.
 */
export async function validateModelDirectory(dir: string): Promise<void> {
	const missing: string[] = [];
	for (const file of BUNDLE_FILES) {
		try {
			const stat = await fs.stat(path.join(dir, file));
			if (!stat.isFile()) {
				missing.push(file);
			}
		} catch {
			missing.push(file);
		}
	}
	if (missing.length > 0) {
		throw new Error(`The Laya model folder "${dir}" is missing: ${missing.join(', ')}.`);
	}
}

export interface DownloadOptions {
	/** Called with the number of bytes received so far across all files, and the total. */
	readonly onProgress?: (receivedBytes: number, totalBytes: number) => void;
	readonly signal?: AbortSignal;
	/** Injectable for tests. Defaults to the global `fetch`. */
	readonly fetch?: typeof fetch;
}

const VERIFIED_STAMP = '.verified.json';

/**
 * Downloads the bundle described by `manifest` into `storageDir` unless a verified copy is
 * already there, and returns the bundle folder. Every file is checked against its size and
 * SHA-256 before it is moved into place.
 */
export async function ensureModelDownloaded(manifest: ModelManifest, storageDir: string, options: DownloadOptions = {}): Promise<string> {
	validateManifest(manifest);

	const dir = path.join(storageDir, 'models', manifest.id);
	const stampPath = path.join(dir, VERIFIED_STAMP);
	const expectedStamp = JSON.stringify(manifest.files);
	if (await readFileOrUndefined(stampPath) === expectedStamp && await sizesMatch(dir, manifest.files)) {
		return dir;
	}

	await fs.rm(stampPath, { force: true });
	const doFetch = options.fetch ?? fetch;
	const totalBytes = manifest.files.reduce((sum, file) => sum + file.size, 0);
	let receivedBytes = 0;

	for (const file of manifest.files) {
		const dest = path.join(dir, file.path);
		if (await fileMatches(dest, file)) {
			receivedBytes += file.size;
			options.onProgress?.(receivedBytes, totalBytes);
			continue;
		}

		const url = new URL(file.path, manifest.baseUrl.endsWith('/') ? manifest.baseUrl : `${manifest.baseUrl}/`);
		const response = await doFetch(url, { signal: options.signal, redirect: 'follow' });
		if (!response.ok || !response.body) {
			throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
		}

		await fs.mkdir(path.dirname(dest), { recursive: true });
		const tmp = `${dest}.part`;
		const hash = createHash('sha256');
		let fileBytes = 0;
		const meter = new Transform({
			transform(chunk: Buffer, _encoding, callback) {
				fileBytes += chunk.length;
				if (fileBytes > file.size) {
					callback(new Error(`Downloaded ${file.path} is larger than expected.`));
					return;
				}
				hash.update(chunk);
				receivedBytes += chunk.length;
				options.onProgress?.(receivedBytes, totalBytes);
				callback(null, chunk);
			}
		});

		try {
			await pipeline(Readable.fromWeb(response.body as WebReadableStream<Uint8Array>), meter, createWriteStream(tmp), { signal: options.signal });
			const digest = hash.digest('hex');
			if (fileBytes !== file.size || digest !== file.sha256) {
				throw new Error(`Integrity check failed for ${file.path}: expected ${file.size} bytes with SHA-256 ${file.sha256}, got ${fileBytes} bytes with SHA-256 ${digest}.`);
			}
			await fs.rename(tmp, dest);
		} catch (error) {
			await fs.rm(tmp, { force: true });
			throw error;
		}
	}

	await fs.writeFile(stampPath, expectedStamp);
	return dir;
}

function validateManifest(manifest: ModelManifest): void {
	if (!/^[\w.-]+$/.test(manifest.id) || manifest.id === '.' || manifest.id === '..') {
		throw new Error(`Invalid model manifest id: ${manifest.id}`);
	}
	const baseUrl = new URL(manifest.baseUrl);
	const isLoopback = baseUrl.hostname === '127.0.0.1' || baseUrl.hostname === 'localhost' || baseUrl.hostname === '[::1]';
	if (baseUrl.protocol !== 'https:' && !(baseUrl.protocol === 'http:' && isLoopback)) {
		throw new Error(`Model manifest base URL must use https: ${manifest.baseUrl}`);
	}
	const paths = new Set(manifest.files.map(file => file.path));
	for (const required of BUNDLE_FILES) {
		if (!paths.has(required)) {
			throw new Error(`Model manifest is missing ${required}.`);
		}
	}
	for (const file of manifest.files) {
		if (!BUNDLE_FILES.includes(file.path)) {
			throw new Error(`Model manifest contains an unexpected file: ${file.path}`);
		}
		if (!/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 0) {
			throw new Error(`Model manifest has an invalid checksum or size for ${file.path}.`);
		}
	}
}

async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, 'utf8');
	} catch {
		return undefined;
	}
}

async function sizesMatch(dir: string, files: readonly ModelManifestFile[]): Promise<boolean> {
	for (const file of files) {
		try {
			if ((await fs.stat(path.join(dir, file.path))).size !== file.size) {
				return false;
			}
		} catch {
			return false;
		}
	}
	return true;
}

async function fileMatches(filePath: string, file: ModelManifestFile): Promise<boolean> {
	try {
		if ((await fs.stat(filePath)).size !== file.size) {
			return false;
		}
	} catch {
		return false;
	}
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(filePath)) {
		hash.update(chunk);
	}
	return hash.digest('hex') === file.sha256;
}
