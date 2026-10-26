/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from '../../../../../../base/common/path.js';
import type { IAgentHostStorageService } from '../../../agentHostStorageService.js';
import { containsCredential, dropCredentialEntries, errorCodeForLog, isSafeRegistryIdentifier, reportDroppedStorageEntries } from '../../../../common/logRedaction.js';
import { DISK_PREFLIGHT_MARGIN_BYTES, PARTIAL_FILE_SUFFIX, PUBLIC_REGISTRY, type LocalModelRegistryName } from './constants.js';
import { computeFileSha256, resolveModelFilePath } from './downloader.js';
import { computeContentId, deriveCapiId, isSha256Hex, isValidCapiId, type ICatalogInstallFact } from './modelCatalog.js';

/*
 * The shared on-disk layout:
 *
 *   <COPILOT_HOME>/azureml-models/
 *     .vscode-server.json      the running llama-server, for orphan recovery (serverSupervisor.ts)
 *     1-lmsrv.sock             server lock socket while held, or left behind by a holder that died (processLock.ts; macOS)
 *   <COPILOT_HOME>/azureml-models/<registry>/<asset-name>/
 *     1-lmdl.sock              download lock socket, likewise (macOS)
 *     .vscode-owner.json       VS Code's ownership record
 *     active.json              snapshot shape; written only if absent or VS Code-owned
 *     <version>/               immutable once complete; manifest.json written last
 *
 * VS Code never deletes or overwrites files it did not write.
 */

export const AZURE_ML_MODELS_DIR_NAME = 'azureml-models';
export const OWNER_FILE_NAME = '.vscode-owner.json';
export const ACTIVE_FILE_NAME = 'active.json';
export const MANIFEST_FILE_NAME = 'manifest.json';
const PENDING_SUFFIX = '.pending';

// #region Snapshot schema

/** One file entry of `manifest.json`. */
export interface ILocalModelManifestFile {
	readonly path: string;
	readonly totalBytes: number;
	readonly sha256: string;
	readonly etag: string;
}

/** `<version>/manifest.json`. Golden-tested; not a compatibility promise. */
export interface ILocalModelManifest {
	readonly assetId: string;
	readonly registry: string;
	readonly name: string;
	readonly version: string;
	readonly primaryPath: string;
	readonly totalBytes: number;
	readonly serveOptions: { readonly ctxSize: number; readonly parallel: number; readonly args: readonly string[] };
	readonly maxConcurrent: number;
	readonly files: readonly ILocalModelManifestFile[];
	readonly extraFiles: readonly string[];
}

/** `<family>/active.json`. */
export interface ILocalModelActiveRecord {
	readonly version: string;
	readonly primaryPath: string;
	readonly manifestPath: string;
	readonly registration: {
		readonly provider: { readonly name: string; readonly type: 'winml'; readonly baseUrl: string; readonly localModel: { readonly modelPath: string; readonly manifestPath: string; readonly ctxSize: number; readonly parallel: number } };
		readonly model: { readonly id: string; readonly provider: string; readonly name: string; readonly autoLocal?: { readonly capiId: string; readonly maxConcurrent: number } };
	};
	readonly descriptor: { readonly assetId: string; readonly registry: string; readonly name: string; readonly version: string; readonly primaryPath: string; readonly manifestPath: string; readonly capiId: string };
}

/** `.vscode-owner.json`: the versions VS Code wrote, oldest first. */
export interface ILocalModelOwnerRecord {
	readonly writer: 'vscode';
	readonly versions: readonly string[];
	readonly writtenAt: string;
	/** VS Code-private: the family's `capiId` (Auto id), so foreign readers don't need tags. */
	readonly capiId?: string;
	/** VS Code-private: this family's content, in another registry's folder, is used as the named on-device registry version instead of downloading it; nothing is moved. */
	readonly promotedTo?: { readonly registry: 'azureml'; readonly assetName: string; readonly version: string; readonly contentId: string };
}

/** Inputs for {@link buildManifest}. */
export interface IManifestInput {
	readonly registry: LocalModelRegistryName;
	readonly assetName: string;
	readonly version: string;
	readonly versionDir: string;
	readonly primaryFile: string;
	readonly files: readonly ILocalModelManifestFile[];
	readonly ctxSize: number;
	readonly parallel: number;
	readonly args: readonly string[];
}

/** Builds the snapshot `manifest.json`. Pure. */
export function buildManifest(input: IManifestInput): ILocalModelManifest {
	return {
		assetId: `azureml://registries/${input.registry}/models/${input.assetName}/versions/${input.version}`,
		registry: input.registry,
		name: input.assetName,
		version: input.version,
		primaryPath: path.join(input.versionDir, input.primaryFile),
		totalBytes: input.files.reduce((sum, file) => sum + file.totalBytes, 0),
		serveOptions: { ctxSize: input.ctxSize, parallel: input.parallel, args: [...input.args] },
		maxConcurrent: input.parallel,
		files: input.files.map(file => ({ path: file.path, totalBytes: file.totalBytes, sha256: file.sha256, etag: file.etag })),
		extraFiles: input.files.filter(file => file.path !== input.primaryFile).map(file => file.path),
	};
}

/** Builds the snapshot `active.json` for a manifest. Pure. */
export function buildActiveRecord(manifest: ILocalModelManifest, manifestPath: string, displayName: string, capiId: string, autoCapable: boolean): ILocalModelActiveRecord {
	const providerName = `winml-${manifest.registry}-${manifest.name}`;
	return {
		version: manifest.version,
		primaryPath: manifest.primaryPath,
		manifestPath,
		registration: {
			provider: {
				name: providerName,
				type: 'winml',
				baseUrl: manifest.primaryPath,
				localModel: { modelPath: manifest.primaryPath, manifestPath, ctxSize: manifest.serveOptions.ctxSize, parallel: manifest.serveOptions.parallel },
			},
			model: {
				id: manifest.name,
				provider: providerName,
				name: `${displayName} (local)`,
				...(autoCapable ? { autoLocal: { capiId, maxConcurrent: manifest.maxConcurrent } } : {}),
			},
		},
		descriptor: { assetId: manifest.assetId, registry: manifest.registry, name: manifest.name, version: manifest.version, primaryPath: manifest.primaryPath, manifestPath, capiId },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Validating reader for `manifest.json`: identifiers must be safe and nothing kept may hold a credential; callers also check it matches its directory. Pure. */
export function readManifest(value: unknown): ILocalModelManifest | undefined {
	if (!isRecord(value) || !isRecord(value.serveOptions) || !Array.isArray(value.files)) {
		return undefined;
	}
	const strings = ['assetId', 'registry', 'name', 'version', 'primaryPath'] as const;
	if (strings.some(key => typeof value[key] !== 'string') || typeof value.totalBytes !== 'number'
		|| !isSafeRegistryIdentifier(value.registry) || !isSafeRegistryIdentifier(value.name) || !isSafeRegistryIdentifier(value.version)) {
		return undefined;
	}
	const files: ILocalModelManifestFile[] = [];
	for (const file of value.files) {
		if (!isRecord(file) || typeof file.path !== 'string' || typeof file.totalBytes !== 'number' || typeof file.sha256 !== 'string') {
			return undefined;
		}
		files.push({ path: file.path, totalBytes: file.totalBytes, sha256: file.sha256.toLowerCase(), etag: typeof file.etag === 'string' ? file.etag : '' });
	}
	const serve = value.serveOptions;
	const manifest: ILocalModelManifest = {
		assetId: value.assetId as string,
		registry: value.registry,
		name: value.name,
		version: value.version,
		primaryPath: value.primaryPath as string,
		totalBytes: value.totalBytes,
		serveOptions: {
			ctxSize: typeof serve.ctxSize === 'number' ? serve.ctxSize : 0,
			parallel: typeof serve.parallel === 'number' ? serve.parallel : 1,
			args: Array.isArray(serve.args) ? serve.args.filter((arg): arg is string => typeof arg === 'string') : [],
		},
		maxConcurrent: typeof value.maxConcurrent === 'number' ? value.maxConcurrent : 1,
		files,
		extraFiles: Array.isArray(value.extraFiles) ? value.extraFiles.filter((file): file is string => typeof file === 'string') : [],
	};
	return containsCredential(manifest) ? undefined : manifest;
}

/** Validating reader for `active.json` (only the fields VS Code uses): the version is a safe identifier, the CAPI id (when kept) a valid one. Pure. */
export function readActiveRecord(value: unknown): { readonly version: string; readonly primaryPath: string; readonly manifestPath: string; readonly capiId?: string } | undefined {
	if (!isRecord(value) || !isSafeRegistryIdentifier(value.version) || typeof value.primaryPath !== 'string' || typeof value.manifestPath !== 'string'
		|| containsCredential([value.primaryPath, value.manifestPath])) {
		return undefined;
	}
	const registration = isRecord(value.registration) && isRecord(value.registration.model) ? value.registration.model : undefined;
	const autoLocal = registration && isRecord(registration.autoLocal) ? registration.autoLocal : undefined;
	const capiId = autoLocal && typeof autoLocal.capiId === 'string' && isValidCapiId(autoLocal.capiId) ? autoLocal.capiId : undefined;
	return { version: value.version, primaryPath: value.primaryPath, manifestPath: value.manifestPath, ...(capiId ? { capiId } : {}) };
}

/** Whether `manifest` names the directory it was read from: its asset (case-insensitively, like the file system) and exactly its version. Pure. */
function manifestMatchesDirectory(manifest: ILocalModelManifest, assetName: string, version: string): boolean {
	return manifest.name.toLowerCase() === assetName.toLowerCase() && manifest.version === version;
}

function readOwnerRecord(value: unknown): ILocalModelOwnerRecord | undefined {
	if (!isRecord(value) || value.writer !== 'vscode' || !Array.isArray(value.versions)) {
		return undefined;
	}
	return {
		writer: 'vscode',
		versions: value.versions.filter(isSafeRegistryIdentifier),
		writtenAt: typeof value.writtenAt === 'string' ? value.writtenAt : '',
		...(typeof value.capiId === 'string' && isValidCapiId(value.capiId) ? { capiId: value.capiId } : {}),
		...(readPromotion(value.promotedTo) ? { promotedTo: readPromotion(value.promotedTo) } : {}),
	};
}

function readPromotion(value: unknown): ILocalModelOwnerRecord['promotedTo'] {
	if (!isRecord(value) || value.registry !== 'azureml' || !isSafeRegistryIdentifier(value.assetName) || !isSafeRegistryIdentifier(value.version) || !isSha256Hex(value.contentId)) {
		return undefined;
	}
	return { registry: 'azureml', assetName: value.assetName, version: value.version, contentId: value.contentId };
}

// #endregion

// #region Errors

export type LocalModelStoreErrorCode = 'filesInUse' | 'storage' | 'invalidName';

export class LocalModelStoreError extends Error {
	constructor(readonly code: LocalModelStoreErrorCode, message?: string) {
		super(message ?? code);
		this.name = 'LocalModelStoreError';
	}
}

function errnoCode(error: unknown): string | undefined {
	const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
	return typeof code === 'string' ? code : undefined;
}

function toStoreError(error: unknown): LocalModelStoreError {
	if (error instanceof LocalModelStoreError) {
		return error;
	}
	const code = errnoCode(error);
	return new LocalModelStoreError(code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' ? 'filesInUse' : 'storage', errorCodeForLog(error));
}

// #endregion

// #region Disk preflight

export interface IDiskSpaceCheck {
	readonly ok: boolean;
	/** Display name of the target volume (`C:\`, a mount point). */
	readonly volume: string;
	readonly availableBytes: number;
	readonly requiredBytes: number;
}

/** `peakDiskBytes + 2 GB`. Pure. */
export function requiredDiskBytes(peakDiskBytes: number): number {
	return peakDiskBytes + DISK_PREFLIGHT_MARGIN_BYTES;
}

/** File-system calls used by the preflight; injectable. */
export interface IDiskSpaceFileSystem {
	stat(path: string): Promise<{ readonly dev: number }>;
	statfs(path: string): Promise<{ readonly bavail: number; readonly bsize: number }>;
}

const nodeDiskSpaceFileSystem: IDiskSpaceFileSystem = {
	stat: p => fs.promises.stat(p),
	statfs: p => fs.promises.statfs(p),
};

/** Compares the available space (`statfs` of the nearest existing ancestor of `targetPath`) with `requiredBytes`. */
export async function checkDiskSpace(targetPath: string, requiredBytes: number, platform: NodeJS.Platform = process.platform, fileSystem: IDiskSpaceFileSystem = nodeDiskSpaceFileSystem): Promise<IDiskSpaceCheck> {
	let current = path.resolve(targetPath);
	let stat: { readonly dev: number } | undefined;
	while (true) {
		try {
			stat = await fileSystem.stat(current);
			break;
		} catch {
			const parent = path.dirname(current);
			if (parent === current) {
				throw new LocalModelStoreError('storage', 'No existing ancestor');
			}
			current = parent;
		}
	}
	const { bavail, bsize } = await fileSystem.statfs(current);
	const availableBytes = bavail * bsize;
	let volume: string;
	if (platform === 'win32') {
		volume = path.win32.parse(current).root || current;
	} else {
		volume = current;
		while (true) {
			const parent = path.dirname(volume);
			if (parent === volume) {
				break;
			}
			try {
				if ((await fileSystem.stat(parent)).dev !== stat.dev) {
					break;
				}
			} catch {
				break;
			}
			volume = parent;
		}
	}
	return { ok: availableBytes >= requiredBytes, volume, availableBytes, requiredBytes };
}

// #endregion

// #region Store

/** A servable version found on disk. */
export interface ILocalModelInstalledVersion {
	/** The registry folder it is in: {@link PUBLIC_REGISTRY}, or another one for content recorded identical to one of its versions (`promotedTo`). */
	readonly registry: string;
	readonly assetName: string;
	readonly version: string;
	readonly familyDir: string;
	readonly versionDir: string;
	readonly manifestPath: string;
	readonly manifest: ILocalModelManifest;
	readonly contentId: string;
	/** `capiId` from the owner record or a foreign `active.json`, else derived from the asset name. */
	readonly capiId: string;
	/** VS Code wrote this version. */
	readonly owned: boolean;
	/** A foreign install used read-only. */
	readonly adopted: boolean;
	/** Whether the SHA-256 of every file was confirmed (owned versions were verified at download). */
	readonly hashesVerified: boolean;
	/** The {@link PUBLIC_REGISTRY} version this install is: its own, or the one its content was recorded identical to. */
	readonly channelVersion: string;
}

/** The catalog's view of an install (merge input). Pure. */
export function toCatalogInstallFact(install: ILocalModelInstalledVersion): ICatalogInstallFact {
	return {
		familyId: install.capiId.toLowerCase(),
		assetName: install.assetName,
		contentId: install.contentId,
		channelVersion: install.channelVersion,
		owned: install.owned,
		adopted: install.adopted,
	};
}

/** File-system mutations the store performs; injectable to simulate `EBUSY`. */
export interface IStoreFileSystem {
	rm(path: string, options: { readonly recursive: boolean; readonly force: boolean }): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	writeFile(path: string, contents: string): Promise<void>;
}

const nodeStoreFileSystem: IStoreFileSystem = {
	rm: (p, options) => fs.promises.rm(p, options),
	rename: (from, to) => fs.promises.rename(from, to),
	writeFile: (p, contents) => fs.promises.writeFile(p, contents, 'utf8'),
};

const ADOPTION_HASH_CACHE_KEY = 'localModel.adoptionHashes';

function assertSafeName(name: string): void {
	if (!isSafeRegistryIdentifier(name)) {
		throw new LocalModelStoreError('invalidName', 'Invalid asset or version name');
	}
}

function isInside(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return !!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Same file system path (case-insensitive where the platform's path rules are). */
function samePath(a: string, b: string): boolean {
	return path.relative(a, b) === '';
}

async function readJson(filePath: string): Promise<unknown> {
	try {
		return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
	} catch {
		return undefined;
	}
}

async function fileSize(filePath: string): Promise<{ readonly size: number; readonly mtimeMs: number } | undefined> {
	try {
		const stat = await fs.promises.stat(filePath);
		return stat.isFile() ? { size: stat.size, mtimeMs: stat.mtimeMs } : undefined;
	} catch {
		return undefined;
	}
}

export interface ILocalModelStoreOptions {
	/** `getCopilotHomePath(...)`. */
	readonly copilotHome: string;
	/** Agent Host storage for the adoption hash cache. */
	readonly storage?: Pick<IAgentHostStorageService, 'get' | 'set'>;
	/** For redacted warnings about dropped cache entries. */
	readonly log?: { warn(message: string): void };
	readonly fileSystem?: IStoreFileSystem;
	readonly platform?: NodeJS.Platform;
	readonly now?: () => number;
}

/** Inputs for {@link LocalModelStore.commitVersion}. */
export interface ICommitVersionInput extends Omit<IManifestInput, 'versionDir'> {
	readonly displayName: string;
	readonly capiId: string;
	readonly autoCapable: boolean;
	/** Point `active.json` at this version when allowed (absent or VS Code-owned). */
	readonly activate: boolean;
}

/** Reads and writes the shared model layout: VS Code-owned versions, read-only adoption of validated foreign installs; only owned files are ever removed. */
export class LocalModelStore {

	readonly rootDir: string;
	private readonly _fs: IStoreFileSystem;
	private readonly _platform: NodeJS.Platform;
	private readonly _now: () => number;

	constructor(private readonly _options: ILocalModelStoreOptions) {
		this.rootDir = path.join(_options.copilotHome, AZURE_ML_MODELS_DIR_NAME);
		this._fs = _options.fileSystem ?? nodeStoreFileSystem;
		this._platform = _options.platform ?? process.platform;
		this._now = _options.now ?? Date.now;
	}

	familyDir(registry: string, assetName: string): string {
		assertSafeName(registry);
		assertSafeName(assetName);
		return path.join(this.rootDir, registry, assetName);
	}

	versionDir(registry: string, assetName: string, version: string): string {
		assertSafeName(version);
		return path.join(this.familyDir(registry, assetName), version);
	}

	async readOwner(registry: string, assetName: string): Promise<ILocalModelOwnerRecord | undefined> {
		return readOwnerRecord(await readJson(path.join(this.familyDir(registry, assetName), OWNER_FILE_NAME)));
	}

	/** Records `version` as VS Code-owned before any file is written, so partial downloads are removable, then creates its directory. */
	async beginVersion(registry: LocalModelRegistryName, assetName: string, version: string, capiId: string): Promise<string> {
		const versionDir = this.versionDir(registry, assetName, version);
		try {
			const owner = await this.readOwner(registry, assetName);
			if (!owner?.versions.includes(version) && await this._exists(versionDir)) {
				// Never take over a version directory another tool created.
				throw new LocalModelStoreError('storage', 'The version directory belongs to another tool');
			}
			// Ownership is recorded before the directory exists, so a crash never leaves an unowned directory behind.
			await fs.promises.mkdir(this.familyDir(registry, assetName), { recursive: true });
			await this._writeOwner(registry, assetName, [...(owner?.versions.filter(v => v !== version) ?? []), version], capiId, owner?.promotedTo);
			await fs.promises.mkdir(versionDir, { recursive: true });
			return versionDir;
		} catch (error) {
			throw toStoreError(error);
		}
	}

	/** Completes an owned version: writes `manifest.json` last (atomically) and points `active.json` at it when `activate` and allowed. */
	async commitVersion(input: ICommitVersionInput): Promise<ILocalModelInstalledVersion> {
		const familyDir = this.familyDir(input.registry, input.assetName);
		const versionDir = this.versionDir(input.registry, input.assetName, input.version);
		const owner = await this.readOwner(input.registry, input.assetName);
		if (!owner?.versions.includes(input.version)) {
			throw new LocalModelStoreError('storage', 'Version was not begun by VS Code');
		}
		if (![input.primaryFile, ...input.files.map(file => file.path)].every(name => resolveModelFilePath(versionDir, name))) {
			throw new LocalModelStoreError('storage', 'Invalid file name');
		}
		const manifest = buildManifest({ ...input, versionDir });
		const manifestPath = path.join(versionDir, MANIFEST_FILE_NAME);
		try {
			await this._atomicWrite(manifestPath, JSON.stringify(manifest, undefined, '\t'));
			if (input.activate) {
				await this._writeActiveIfAllowed(familyDir, owner, buildActiveRecord(manifest, manifestPath, input.displayName, input.capiId, input.autoCapable));
			}
		} catch (error) {
			throw toStoreError(error);
		}
		return {
			registry: input.registry,
			assetName: input.assetName,
			version: input.version,
			familyDir,
			versionDir,
			manifestPath,
			manifest,
			contentId: computeContentId(manifest.files.map(file => ({ path: file.path, sizeBytes: file.totalBytes, sha256: file.sha256 }))),
			capiId: input.capiId,
			owned: true,
			adopted: false,
			hashesVerified: true,
			channelVersion: input.version,
		};
	}

	/** Every family with something servable: those of {@link PUBLIC_REGISTRY}, and those elsewhere recorded identical to one of its versions (`promotedTo`). */
	async listInstalled(): Promise<ILocalModelInstalledVersion[]> {
		const installs: ILocalModelInstalledVersion[] = [];
		let registries: string[];
		try {
			registries = (await fs.promises.readdir(this.rootDir, { withFileTypes: true })).filter(entry => entry.isDirectory() && isSafeRegistryIdentifier(entry.name)).map(entry => entry.name);
		} catch {
			return installs;
		}
		// The registry's own installs first: they win over an identical one elsewhere.
		registries.sort((a, b) => Number(b === PUBLIC_REGISTRY) - Number(a === PUBLIC_REGISTRY) || a.localeCompare(b));
		for (const registry of registries) {
			let assets: string[] = [];
			try {
				assets = (await fs.promises.readdir(path.join(this.rootDir, registry), { withFileTypes: true })).filter(entry => entry.isDirectory() && isSafeRegistryIdentifier(entry.name)).map(entry => entry.name);
			} catch {
				continue;
			}
			for (const asset of assets) {
				const selected = await this.selectServingVersion(registry, asset);
				if (selected) {
					installs.push(selected);
				}
			}
		}
		return installs;
	}

	/**
	 * Chooses the version to serve: the newest complete VS Code-owned version that may be listed, else a validated foreign
	 * install. Foreign hashes are verified separately by {@link verifyAdoptedVersion}.
	 */
	async selectServingVersion(registry: string, assetName: string): Promise<ILocalModelInstalledVersion | undefined> {
		const familyDir = this.familyDir(registry, assetName);
		const owner = await this.readOwner(registry, assetName);
		for (const version of [...(owner?.versions ?? [])].reverse()) {
			if (!isSafeRegistryIdentifier(version)) {
				continue;
			}
			const versionDir = path.join(familyDir, version);
			const manifestPath = path.join(versionDir, MANIFEST_FILE_NAME);
			const manifest = readManifest(await readJson(manifestPath));
			if (manifest && manifestMatchesDirectory(manifest, assetName, version) && await this._filesMatchSizes(versionDir, manifest)) {
				const installed = this._toInstalled(registry, assetName, version, familyDir, versionDir, manifestPath, manifest, owner?.capiId, true, true, owner?.promotedTo);
				// A newer version that may not be listed doesn't hide an older one that may.
				if (installed) {
					return installed;
				}
			}
		}

		const active = readActiveRecord(await readJson(path.join(familyDir, ACTIVE_FILE_NAME)));
		if (!active || owner?.versions.includes(active.version)) {
			return undefined;
		}
		if (!path.isAbsolute(active.primaryPath) || !path.isAbsolute(active.manifestPath)) {
			return undefined;
		}
		const realFamily = await this._realpath(familyDir);
		const realPrimary = await this._realpath(active.primaryPath);
		const realManifest = await this._realpath(active.manifestPath);
		if (!realFamily || !realPrimary || !realManifest || !isInside(realFamily, realPrimary) || !isInside(realFamily, realManifest)) {
			return undefined;
		}
		const manifest = readManifest(await readJson(realManifest));
		if (!manifest || !path.isAbsolute(manifest.primaryPath)) {
			return undefined;
		}
		const versionDir = path.dirname(realManifest);
		// The version is the directory's: a direct child of the family directory whose name is a safe
		// identifier and matches both `active.json` and the manifest (a foreign record is never trusted alone).
		const version = path.basename(versionDir);
		if (!samePath(path.dirname(versionDir), realFamily) || !isSafeRegistryIdentifier(version) || active.version !== version || !manifestMatchesDirectory(manifest, assetName, version)) {
			return undefined;
		}
		// Every referenced file is canonicalized and must stay inside the version
		// directory; the manifest's primary must be the validated active primary
		// and one of the listed (hashed) files.
		const realFiles = await this._canonicalFiles(versionDir, manifest);
		const manifestPrimary = await this._realpath(manifest.primaryPath);
		if (!realFiles || !manifestPrimary || !samePath(manifestPrimary, realPrimary) || !realFiles.some(file => samePath(file, realPrimary))) {
			return undefined;
		}
		const validated: ILocalModelManifest = { ...manifest, primaryPath: realPrimary };
		const verified = await this._cachedHashesMatch(versionDir, validated);
		return this._toInstalled(registry, assetName, version, familyDir, versionDir, realManifest, validated, active.capiId ?? owner?.capiId, false, verified, owner?.promotedTo);
	}

	/** Re-hashes an adopted version once before first use (cached by path, mtime and size); containment is checked again on canonical paths. */
	async verifyAdoptedVersion(install: ILocalModelInstalledVersion, signal?: AbortSignal): Promise<boolean> {
		if (install.hashesVerified) {
			return true;
		}
		const realFiles = await this._canonicalFiles(install.versionDir, install.manifest);
		const realPrimary = await this._realpath(install.manifest.primaryPath);
		if (!realFiles || !realPrimary || !realFiles.some(file => samePath(file, realPrimary))) {
			return false;
		}
		const cache = { ...this._readHashCache() };
		for (const [index, file] of install.manifest.files.entries()) {
			const filePath = realFiles[index];
			const stat = await fileSize(filePath);
			if (!stat || stat.size !== file.totalBytes) {
				return false;
			}
			const key = `${filePath}|${stat.mtimeMs}|${stat.size}`;
			const hash = cache[key] ?? await computeFileSha256(filePath, { signal });
			cache[key] = hash;
			if (hash !== file.sha256) {
				this._writeHashCache(cache);
				return false;
			}
		}
		this._writeHashCache(cache);
		return true;
	}

	/** Canonical paths of every manifest file, or `undefined` when one is absolute, escapes `versionDir` (even through links), is missing or has the wrong size. */
	private async _canonicalFiles(versionDir: string, manifest: ILocalModelManifest): Promise<string[] | undefined> {
		const realVersionDir = await this._realpath(versionDir);
		if (!realVersionDir || manifest.files.length === 0) {
			return undefined;
		}
		const result: string[] = [];
		for (const file of manifest.files) {
			if (!file.path || path.isAbsolute(file.path) || !isInside(versionDir, path.join(versionDir, file.path))) {
				return undefined;
			}
			const real = await this._realpath(path.join(versionDir, file.path));
			const stat = real ? await fileSize(real) : undefined;
			if (!real || !isInside(realVersionDir, real) || !stat || stat.size !== file.totalBytes) {
				return undefined;
			}
			result.push(real);
		}
		return result;
	}

	/** Deletes owned versions other than `keep`; foreign versions are never touched. */
	async pruneOwnedVersions(registry: string, assetName: string, keep: readonly string[]): Promise<string[]> {
		const owner = await this.readOwner(registry, assetName);
		if (!owner) {
			return [];
		}
		const familyDir = this.familyDir(registry, assetName);
		const removed: string[] = [];
		const remaining: string[] = [];
		try {
			for (const version of owner.versions) {
				if (keep.includes(version) || !isSafeRegistryIdentifier(version)) {
					remaining.push(version);
					continue;
				}
				await this._fs.rm(path.join(familyDir, version), { recursive: true, force: true });
				removed.push(version);
			}
			await this._writeOwner(registry, assetName, remaining, owner.capiId, owner.promotedTo);
		} catch (error) {
			throw toStoreError(error);
		}
		return removed;
	}

	/** Remove: deletes owned versions and partial files, `active.json` if VS Code owns it, the owner record, then the empty family directory. `EBUSY`/`EPERM` -> `filesInUse`. */
	async removeFamily(registry: string, assetName: string): Promise<void> {
		const familyDir = this.familyDir(registry, assetName);
		const owner = await this.readOwner(registry, assetName);
		if (!owner) {
			return;
		}
		try {
			for (const version of owner.versions) {
				if (isSafeRegistryIdentifier(version)) {
					await this._fs.rm(path.join(familyDir, version), { recursive: true, force: true });
				}
			}
			const activePath = path.join(familyDir, ACTIVE_FILE_NAME);
			const active = readActiveRecord(await readJson(activePath));
			if (active && owner.versions.includes(active.version)) {
				await this._fs.rm(activePath, { recursive: false, force: true });
			}
			await this._fs.rm(path.join(familyDir, OWNER_FILE_NAME), { recursive: false, force: true });
			const rest = await fs.promises.readdir(familyDir).catch(() => [] as string[]);
			if (rest.length === 0) {
				await fs.promises.rmdir(familyDir).catch(() => undefined);
			}
		} catch (error) {
			throw toStoreError(error);
		}
	}

	/** Disk preflight for a setup: `peakDiskBytes` minus what of `version` is already on disk ({@link bytesOnDisk}), plus the margin. */
	async checkDiskSpace(registry: LocalModelRegistryName, assetName: string, peakDiskBytes: number, version?: string): Promise<IDiskSpaceCheck> {
		const onDisk = version !== undefined ? await this.bytesOnDisk(registry, assetName, version) : 0;
		return checkDiskSpace(this.familyDir(registry, assetName), requiredDiskBytes(Math.max(0, peakDiskBytes - onDisk)), this._platform);
	}

	/** Bytes of a version already on disk that a download reuses or resumes: placed files and VS Code's `.vscode.partial` files. */
	async bytesOnDisk(registry: LocalModelRegistryName, assetName: string, version: string): Promise<number> {
		const versionDir = this.versionDir(registry, assetName, version);
		let entries: fs.Dirent[];
		try {
			entries = await fs.promises.readdir(versionDir, { withFileTypes: true });
		} catch {
			return 0;
		}
		let total = 0;
		for (const entry of entries) {
			const name = entry.name.toLowerCase();
			const counts = name.endsWith(PARTIAL_FILE_SUFFIX) || !/\.(?:json|partial|part|tmp|pending)$/.test(name);
			if (entry.isFile() && counts) {
				total += (await fileSize(path.join(versionDir, entry.name)))?.size ?? 0;
			}
		}
		return total;
	}

	/** `undefined` for a version in another registry's folder unless VS Code recorded its content identical to a {@link PUBLIC_REGISTRY} version. */
	private _toInstalled(registry: string, assetName: string, version: string, familyDir: string, versionDir: string, manifestPath: string, manifest: ILocalModelManifest, capiId: string | undefined, owned: boolean, hashesVerified: boolean, promotedTo: ILocalModelOwnerRecord['promotedTo']): ILocalModelInstalledVersion | undefined {
		const contentId = computeContentId(manifest.files.map(file => ({ path: file.path, sizeBytes: file.totalBytes, sha256: file.sha256 })));
		const promoted = registry !== PUBLIC_REGISTRY && promotedTo?.contentId === contentId ? promotedTo : undefined;
		if (registry !== PUBLIC_REGISTRY && !promoted) {
			return undefined;
		}
		// Identity comes from the validated directory (registry, asset, version), never from the manifest's text.
		return {
			registry,
			assetName,
			version,
			familyDir,
			versionDir,
			manifestPath,
			manifest,
			contentId,
			capiId: capiId ?? deriveCapiId(assetName),
			owned,
			adopted: !owned,
			hashesVerified,
			channelVersion: promoted ? promoted.version : version,
		};
	}

	private async _filesMatchSizes(versionDir: string, manifest: ILocalModelManifest): Promise<boolean> {
		if (manifest.files.length === 0) {
			return false;
		}
		for (const file of manifest.files) {
			const filePath = path.join(versionDir, file.path);
			// A manifest on disk may come from another tool: its paths must stay inside the version directory.
			const stat = !path.isAbsolute(file.path) && isInside(versionDir, filePath) ? await fileSize(filePath) : undefined;
			if (!stat || stat.size !== file.totalBytes) {
				return false;
			}
		}
		return true;
	}

	private async _cachedHashesMatch(versionDir: string, manifest: ILocalModelManifest): Promise<boolean> {
		const cache = this._readHashCache();
		const realFiles = await this._canonicalFiles(versionDir, manifest);
		if (!realFiles) {
			return false;
		}
		for (const [index, file] of manifest.files.entries()) {
			const filePath = realFiles[index];
			const stat = await fileSize(filePath);
			if (!stat || cache[`${filePath}|${stat.mtimeMs}|${stat.size}`] !== file.sha256) {
				return false;
			}
		}
		return true;
	}

	/** The adoption hash cache; entries that are not `path|mtime|size` -> SHA-256 or that hold a credential are dropped. */
	private _readHashCache(): Record<string, string> {
		const value = this._options.storage?.get<unknown>(ADOPTION_HASH_CACHE_KEY);
		if (!isRecord(value)) {
			return {};
		}
		const entries = Object.entries(value);
		const kept = entries.filter((entry): entry is [string, string] => isSha256Hex(entry[1]) && !containsCredential(entry[0]));
		reportDroppedStorageEntries(this._options.log, ADOPTION_HASH_CACHE_KEY, entries.length - kept.length);
		return Object.fromEntries(kept);
	}

	/** Belt and braces: an entry that holds anything credential-like is never written. */
	private _writeHashCache(cache: Record<string, string>): void {
		const scrubbed = dropCredentialEntries(cache);
		reportDroppedStorageEntries(this._options.log, ADOPTION_HASH_CACHE_KEY, scrubbed.dropped);
		this._options.storage?.set(ADOPTION_HASH_CACHE_KEY, scrubbed.kept);
	}

	private async _writeOwner(registry: string, assetName: string, versions: readonly string[], capiId: string | undefined, promotedTo: ILocalModelOwnerRecord['promotedTo']): Promise<void> {
		const record: ILocalModelOwnerRecord = { writer: 'vscode', versions, writtenAt: new Date(this._now()).toISOString(), ...(capiId ? { capiId } : {}), ...(promotedTo ? { promotedTo } : {}) };
		await this._atomicWrite(path.join(this.familyDir(registry, assetName), OWNER_FILE_NAME), JSON.stringify(record, undefined, '\t'));
	}

	private async _writeActiveIfAllowed(familyDir: string, owner: ILocalModelOwnerRecord, record: ILocalModelActiveRecord): Promise<boolean> {
		const activePath = path.join(familyDir, ACTIVE_FILE_NAME);
		const raw = await readJson(activePath);
		const exists = raw !== undefined || await this._exists(activePath);
		const current = readActiveRecord(raw);
		if (exists && (!current || !owner.versions.includes(current.version))) {
			return false;
		}
		await this._atomicWrite(activePath, JSON.stringify(record, undefined, '\t'));
		return true;
	}

	private async _atomicWrite(filePath: string, contents: string): Promise<void> {
		const pending = filePath + PENDING_SUFFIX;
		await this._fs.writeFile(pending, contents);
		await this._fs.rename(pending, filePath);
	}

	private async _exists(filePath: string): Promise<boolean> {
		try {
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	private async _realpath(filePath: string): Promise<string | undefined> {
		try {
			return await fs.promises.realpath(filePath);
		} catch {
			return undefined;
		}
	}
}

// #endregion
