/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constants } from 'fs';
import { lstat, mkdir, open, opendir, realpath, rename, rm } from 'fs/promises';
import { createHash } from 'crypto';
import { Sequencer } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorCode } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname, isAbsolute, join, relative, sep } from '../../../base/common/path.js';
import { isEqual, isEqualOrParent } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { vArray, vNumber, vObj, vOptionalProp, vString } from '../../../base/common/validation.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostCanvasPackagesService, type IAgentHostCanvasPackage, type ICanvasPackageApproval, type ICanvasPackageLaunch, type ICanvasPackageSnapshot } from '../common/agentHostCanvasPackages.js';
import { IAgentPluginManager } from '../common/agentPluginManager.js';
import { IAgentHostStorageService } from './agentHostStorageService.js';

const STORAGE_KEY = 'canvasPackages.v1';
const PLUGIN_MANIFEST = '.plugin/plugin.json';
const EXTENSIONS_DIRECTORY = 'com.github.copilot/extensions';
const ENTRYPOINTS = new Set(['extension.mjs', 'extension.cjs', 'extension.js']);
const REVISION_PATTERN = /^[a-f0-9]{64}$/;

export interface ICanvasPackageLimits {
	readonly maxFiles: number;
	readonly maxBytes: number;
	readonly maxDepth: number;
	readonly maxPackages: number;
	readonly maxSnapshots: number;
}

const DEFAULT_LIMITS: ICanvasPackageLimits = {
	maxFiles: 2048,
	maxBytes: 16 * 1024 * 1024,
	maxDepth: 24,
	maxPackages: 32,
	maxSnapshots: 128,
};

const storedPackages = vArray(vObj({
	id: vString(),
	name: vString(),
	source: vString(),
	revision: vString(),
	fileCount: vNumber(),
	byteLength: vNumber(),
	approval: vOptionalProp(vObj({
		revision: vString(),
		workspaces: vOptionalProp(vArray(vString())),
	})),
}));

interface IPackageFile {
	readonly path: string;
	readonly bytes: Uint8Array;
}

type StoredCanvasPackage = Omit<IAgentHostCanvasPackage, 'snapshot'>;

type CanvasPackagesState =
	| { readonly kind: 'available'; readonly packages: readonly StoredCanvasPackage[] }
	| { readonly kind: 'unavailable'; readonly error: Error };

/** Installs inert, content-addressed Open Plugin snapshots; only a separate approval permits launch. */
export class AgentHostCanvasPackagesService extends Disposable implements IAgentHostCanvasPackagesService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidChange = this._register(new Emitter<string>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _mutations = new Sequencer();
	private readonly _blocked = new Set<string>();
	private readonly _authorityVersions = new Map<string, number>();
	private readonly _root: URI;
	private _canonicalRoot: URI | undefined;
	private _rootCreation: Promise<URI> | undefined;
	private _state: CanvasPackagesState;

	constructor(
		@IAgentPluginManager pluginManager: IAgentPluginManager,
		@IAgentHostStorageService private readonly storage: IAgentHostStorageService,
		@ILogService private readonly logService: ILogService,
		private readonly limits: ICanvasPackageLimits = DEFAULT_LIMITS,
	) {
		super();
		this._root = URI.joinPath(pluginManager.basePath, 'canvas-packages');
		try {
			if (pluginManager.basePath.scheme !== Schemas.file) {
				throw new Error('Local canvas packages require file-backed host storage.');
			}
			if (storage.loadError) {
				throw storage.loadError;
			}
			const value = storage.get(STORAGE_KEY);
			const packages = storedPackages.validateOrThrow(value === undefined ? [] : value);
			const ids = new Set<string>();
			for (const item of packages) {
				if (!REVISION_PATTERN.test(item.id) || ids.has(item.id) || !REVISION_PATTERN.test(item.revision)
					|| !Number.isSafeInteger(item.fileCount) || item.fileCount < 0
					|| !Number.isSafeInteger(item.byteLength) || item.byteLength < 0
					|| (item.approval && !REVISION_PATTERN.test(item.approval.revision))) {
					throw new Error('Canvas package approvals contain an invalid identity or revision.');
				}
				for (const value of [item.source, ...(item.approval?.workspaces ?? [])]) {
					const uri = URI.parse(value, true);
					if (uri.scheme !== Schemas.file || uri.query || uri.fragment || !isAbsolute(uri.fsPath)) {
						throw new Error('Canvas package approvals contain an invalid local folder URI.');
					}
				}
				ids.add(item.id);
			}
			this._state = { kind: 'available', packages };
		} catch (cause) {
			const error = new Error(localize('canvasPackage.unavailable', "Local canvas packages are unavailable because their saved approvals could not be read. Saved records have not been changed. Restore valid host storage and restart the Agent Host before managing or running packages."), { cause });
			this._state = { kind: 'unavailable', error };
			this.logService.error('[CanvasPackages] Package approval storage is unavailable.', error);
		}
	}

	get supported(): boolean {
		return this._state.kind === 'available';
	}

	get unavailableError(): Error | undefined {
		return this._state.kind === 'unavailable' ? this._state.error : undefined;
	}

	private get _packages(): readonly StoredCanvasPackage[] {
		return this._assertAvailable().packages;
	}

	private _assertAvailable(): Extract<CanvasPackagesState, { kind: 'available' }> {
		if (this._state.kind === 'unavailable') {
			throw this._state.error;
		}
		return this._state;
	}

	list(): readonly IAgentHostCanvasPackage[] {
		return this._packages.map(item => this._info(item));
	}

	private _info(item: StoredCanvasPackage): IAgentHostCanvasPackage {
		return {
			...item,
			snapshot: this._snapshot(item.id, item.revision).toString(),
			...(item.approval ? { approval: { ...item.approval, ...(item.approval.workspaces ? { workspaces: [...item.approval.workspaces] } : {}) } } : {}),
		};
	}

	async prepare(source: URI, token: CancellationToken = CancellationToken.None): Promise<IAgentHostCanvasPackage> {
		this._assertAvailable();
		const canonicalSource = await this._localDirectory(source);
		const root = await this._ensureRoot();
		if (isEqualOrParent(root, canonicalSource) || isEqualOrParent(canonicalSource, root)) {
			throw new Error(localize('canvasPackage.sourceOverlapsStorage', "Choose a source folder outside the canvas package storage directory."));
		}
		const sourceFiles = await this._readFiles(canonicalSource, token, true);
		this._checkCancellation(token);

		return this._mutations.queue(async () => {
			this._checkCancellation(token);
			const previous = this._packages.find(item => isEqual(URI.parse(item.source), canonicalSource));
			if (!previous && this._packages.length >= this.limits.maxPackages) {
				throw new Error(localize('canvasPackage.tooManyPackages', "The limit of {0} installed canvas packages has been reached.", this.limits.maxPackages));
			}
			const id = previous?.id ?? createHash('sha256').update(canonicalSource.toString()).digest('hex');
			const files = this._toPlugin(id, sourceFiles);
			const revision = this._revision(files);
			const destination = this._snapshot(id, revision);
			await this._checkSnapshotCapacity(destination);
			const staging = URI.joinPath(root, 'staging', generateUuid());
			let staged = false;
			try {
				await mkdir(staging.fsPath, { recursive: true });
				staged = true;
				for (const file of files) {
					this._checkCancellation(token);
					const target = join(staging.fsPath, ...file.path.split('/'));
					await mkdir(dirname(target), { recursive: true });
					const handle = await open(target, 'wx');
					try {
						await handle.writeFile(file.bytes);
					} finally {
						await handle.close();
					}
				}
				this._checkCancellation(token);
				await mkdir(dirname(destination.fsPath), { recursive: true });
				try {
					await rename(staging.fsPath, destination.fsPath);
					staged = false;
				} catch (error) {
					if (!this._isExistingDirectoryError(error)) {
						throw error;
					}
					await this._verifySnapshot(id, revision);
				}
				this._checkCancellation(token);
				const item: StoredCanvasPackage = {
					id,
					name: previous?.name ?? canonicalSource.path.split('/').at(-1) ?? id,
					source: canonicalSource.toString(),
					revision,
					fileCount: files.length,
					byteLength: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
					...(previous?.approval ? { approval: previous.approval } : {}),
				};
				await this._persist([...this._packages.filter(item => item.id !== id), item]);
				this._onDidChange.fire(id);
				return this._info(item);
			} finally {
				if (staged) {
					await rm(staging.fsPath, { recursive: true, force: true });
				}
			}
		});
	}

	async approve(id: string, revision: string, workspace?: URI): Promise<void> {
		const version = this._beginAuthorityChange(id);
		return this._mutations.queue(async () => {
			const item = this._get(id);
			let succeeded = false;
			try {
				if (item.revision !== revision) {
					throw new Error(localize('canvasPackage.reviewChanged', "The package changed after review. Review its current revision before approving it."));
				}
				const scope = workspace ? (await this._localDirectory(workspace)).toString() : undefined;
				await this._verifySnapshot(id, revision);
				this._assertAuthorityVersion(id, version);
				const previous = item.approval?.revision === revision ? item.approval : undefined;
				const approval: ICanvasPackageApproval = {
					revision,
					...(scope && (!previous || previous.workspaces) ? { workspaces: [...new Set([...(previous?.workspaces ?? []), scope])] } : {}),
				};
				await this._persist(this._packages.map(value => value.id === id ? { ...value, approval } : value));
				succeeded = true;
			} finally {
				if (succeeded && this._authorityVersions.get(id) === version) {
					this._blocked.delete(id);
				}
				this._onDidChange.fire(id);
			}
		});
	}

	revoke(id: string): Promise<void> {
		const version = this._beginAuthorityChange(id);
		return this._mutations.queue(async () => {
			const item = this._get(id);
			const { approval: _approval, ...revoked } = item;
			await this._persist(this._packages.map(value => value.id === id ? revoked : value));
			if (this._authorityVersions.get(id) === version) {
				this._blocked.delete(id);
			}
			this._onDidChange.fire(id);
		});
	}

	remove(id: string): Promise<void> {
		const version = this._beginAuthorityChange(id);
		return this._mutations.queue(async () => {
			await this._persist(this._packages.filter(item => item.id !== id));
			if (this._authorityVersions.get(id) === version) {
				this._blocked.delete(id);
				this._authorityVersions.delete(id);
			}
			this._onDidChange.fire(id);
		});
	}

	isApproved(id: string, revision: string, workspace: URI): boolean {
		if (!this.supported || workspace.scheme !== Schemas.file || workspace.query || workspace.fragment || this._blocked.has(id)) {
			return false;
		}
		const approval = this._packages.find(item => item.id === id)?.approval;
		return approval?.revision === revision && (!approval.workspaces
			|| approval.workspaces.some(scope => isEqual(URI.parse(scope), workspace)));
	}

	async getApprovedPluginDirectories(workspace: URI): Promise<readonly URI[]> {
		return (await this.getApprovedSnapshots(workspace)).map(snapshot => snapshot.pluginDirectory);
	}

	async getApprovedSnapshots(workspace: URI): Promise<readonly ICanvasPackageSnapshot[]> {
		await this._ensureRoot();
		const canonicalWorkspace = await this._localDirectory(workspace);
		const result: ICanvasPackageSnapshot[] = [];
		for (const item of this._packages) {
			const revision = item.approval?.revision;
			if (revision && this.isApproved(item.id, revision, canonicalWorkspace)) {
				await this._verifySnapshot(item.id, revision);
				if (this.isApproved(item.id, revision, canonicalWorkspace)) {
					result.push({ packageId: item.id, revision, pluginDirectory: this._snapshot(item.id, revision), workspace: canonicalWorkspace });
				}
			}
		}
		return result;
	}

	async resolveLaunch(extensionId: string, modulePath: string, workspace: URI): Promise<ICanvasPackageLaunch | undefined> {
		await this._ensureRoot();
		if (!isAbsolute(modulePath)) {
			this.logService.warn('[CanvasPackages] Declined a non-absolute extension entrypoint.');
			return undefined;
		}
		const canonicalWorkspace = await this._localDirectory(workspace);
		for (const item of this._packages) {
			const revision = item.approval?.revision;
			if (!revision || !this.isApproved(item.id, revision, canonicalWorkspace)) {
				continue;
			}
			const pluginDirectory = this._snapshot(item.id, revision);
			if (!isEqualOrParent(URI.file(modulePath), pluginDirectory)) {
				continue;
			}
			const files = await this._verifySnapshot(item.id, revision);
			const entry = files.find(file => this._isEntrypoint(file.path) && isEqual(URI.file(join(pluginDirectory.fsPath, ...file.path.split('/'))), URI.file(modulePath)));
			if (!entry || extensionId !== `plugin:${this._pluginName(item.id)}:${entry.path.split('/')[2]}` || !this.isApproved(item.id, revision, canonicalWorkspace)) {
				this.logService.warn('[CanvasPackages] Declined an extension whose identity or approval changed.');
				return undefined;
			}
			const workspaceKey = createHash('sha256').update(canonicalWorkspace.toString()).digest('hex');
			const moduleKey = createHash('sha256').update(entry.path).digest('hex');
			const dataDirectory = URI.joinPath(await this._ensureRoot(), 'data', item.id, workspaceKey, moduleKey);
			await mkdir(dataDirectory.fsPath, { recursive: true });
			if (!this.isApproved(item.id, revision, canonicalWorkspace)) {
				this.logService.warn('[CanvasPackages] Approval was revoked before launch.');
				return undefined;
			}
			return { packageId: item.id, revision, pluginDirectory, workspace: canonicalWorkspace, dataDirectory };
		}
		this.logService.trace('[CanvasPackages] Declined an extension outside the approved installed packages.');
		return undefined;
	}

	private _get(id: string): StoredCanvasPackage {
		const item = this._packages.find(item => item.id === id);
		if (!item) {
			throw new Error(localize('canvasPackage.notFound', "The canvas package is no longer installed."));
		}
		return item;
	}

	private _snapshot(id: string, revision: string): URI {
		if (!REVISION_PATTERN.test(id) || !REVISION_PATTERN.test(revision)) {
			throw new Error('Invalid canvas package identity or revision.');
		}
		return URI.joinPath(this._canonicalRoot ?? this._root, 'snapshots', id, revision);
	}

	private async _persist(packages: readonly StoredCanvasPackage[]): Promise<void> {
		this._assertAvailable();
		this._checkCancellation(CancellationToken.None);
		await this.storage.setAndFlush(STORAGE_KEY, packages);
		this._state = { kind: 'available', packages };
	}

	private async _localDirectory(uri: URI): Promise<URI> {
		if (uri.scheme !== Schemas.file || uri.query || uri.fragment) {
			throw new Error(localize('canvasPackage.localFolder', "Canvas packages require a local folder."));
		}
		const canonical = await realpath(uri.fsPath);
		if (!(await lstat(canonical)).isDirectory()) {
			throw new Error(localize('canvasPackage.notDirectory', "Choose a local folder, not a file."));
		}
		return URI.file(canonical);
	}

	private _toPlugin(id: string, source: readonly IPackageFile[]): readonly IPackageFile[] {
		if (!source.some(file => ENTRYPOINTS.has(file.path))) {
			throw new Error(localize('canvasPackage.noEntrypoint', "Choose an extension folder containing extension.mjs, extension.cjs or extension.js."));
		}
		const files = source.map(file => ({ path: `${EXTENSIONS_DIRECTORY}/main/${file.path}`, bytes: file.bytes }));
		const manifest = JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: this._pluginName(id) });
		const result = [...files, { path: PLUGIN_MANIFEST, bytes: Buffer.from(manifest) }];
		if (result.length > this.limits.maxFiles || result.reduce((sum, file) => sum + file.bytes.byteLength, 0) > this.limits.maxBytes) {
			throw new Error(localize('canvasPackage.wrapperLimit', "The canvas package, including its plugin manifest, exceeds the package size limit."));
		}
		return result;
	}

	private _isEntrypoint(path: string): boolean {
		const parts = path.split('/');
		return parts.length === 4 && parts[0] === 'com.github.copilot' && parts[1] === 'extensions' && ENTRYPOINTS.has(parts[3]);
	}

	private _pluginName(id: string): string {
		return `canvas-${id.slice(0, 48)}`;
	}

	private _revision(files: readonly IPackageFile[]): string {
		const entries = files.map(file => ({ path: file.path, size: file.bytes.byteLength, hash: createHash('sha256').update(file.bytes).digest('hex') }));
		entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
		return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
	}

	private async _verifySnapshot(id: string, revision: string): Promise<readonly IPackageFile[]> {
		await this._ensureRoot();
		const files = await this._readFiles(this._snapshot(id, revision), CancellationToken.None, false);
		if (this._revision(files) !== revision) {
			this._blocked.add(id);
			this._onDidChange.fire(id);
			throw new Error(localize('canvasPackage.modifiedSnapshot', "The installed canvas package has changed. Reinstall and review it before running it."));
		}
		return files;
	}

	private async _checkSnapshotCapacity(destination: URI): Promise<void> {
		try {
			const stat = await lstat(destination.fsPath);
			if (stat.isSymbolicLink() || !stat.isDirectory()) {
				throw new Error('The installed canvas snapshot is not a regular directory.');
			}
			return;
		} catch (error) {
			if (getErrorCode(error) !== 'ENOENT') {
				throw error;
			}
		}
		const root = await this._ensureRoot();
		let count = 0;
		const countDirectories = async (directory: URI, nested: boolean): Promise<void> => {
			let entries;
			try {
				entries = await opendir(directory.fsPath);
			} catch (error) {
				if (getErrorCode(error) === 'ENOENT') {
					return;
				}
				throw error;
			}
			for await (const entry of entries) {
				if (!entry.isDirectory() || entry.isSymbolicLink()) {
					throw new Error('Canvas snapshot storage contains an invalid entry.');
				}
				if (nested) {
					await countDirectories(URI.joinPath(directory, entry.name), false);
				} else if (++count >= this.limits.maxSnapshots) {
					throw new Error(localize('canvasPackage.snapshotLimit', "The limit of {0} retained canvas package snapshots has been reached. Existing revisions and documents have been preserved.", this.limits.maxSnapshots));
				}
			}
		};
		// Retired revisions and interrupted staging copies count too; never collect possibly live code.
		await countDirectories(URI.joinPath(root, 'snapshots'), true);
		await countDirectories(URI.joinPath(root, 'staging'), false);
	}

	private async _readFiles(root: URI, token: CancellationToken, skipGit: boolean): Promise<readonly IPackageFile[]> {
		const files: IPackageFile[] = [];
		let totalBytes = 0;
		let entries = 0;
		const visit = async (directory: string, segments: readonly string[]): Promise<void> => {
			this._checkCancellation(token);
			const directoryStat = await lstat(directory);
			if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
				throw new Error(localize('canvasPackage.invalidDirectory', "The canvas package contains a replaced or invalid folder."));
			}
			if (segments.length > this.limits.maxDepth) {
				throw new Error(localize('canvasPackage.depthLimit', "The canvas package exceeds the maximum folder depth of {0}.", this.limits.maxDepth));
			}
			const dir = await opendir(directory);
			for await (const entry of dir) {
				this._checkCancellation(token);
				if (skipGit && entry.name === '.git') {
					continue;
				}
				if (++entries > this.limits.maxFiles * 2) {
					throw new Error(localize('canvasPackage.entryLimit', "The canvas package contains too many filesystem entries."));
				}
				const path = join(directory, entry.name);
				if (entry.isSymbolicLink()) {
					throw new Error(localize('canvasPackage.symlink', "Canvas packages cannot contain symbolic links. Bundle their dependencies before installing."));
				}
				const real = await realpath(path);
				const within = relative(root.fsPath, real);
				if (within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
					throw new Error(localize('canvasPackage.outsideRoot', "A canvas package entry resolves outside its source folder."));
				}
				const childSegments = [...segments, entry.name];
				if (entry.isDirectory()) {
					await visit(path, childSegments);
					continue;
				}
				if (!entry.isFile() || files.length >= this.limits.maxFiles) {
					throw new Error(localize('canvasPackage.fileLimit', "Canvas packages must contain only regular files within the {0}-file limit.", this.limits.maxFiles));
				}
				const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
				try {
					const stat = await handle.stat();
					const remaining = this.limits.maxBytes - totalBytes;
					if (!stat.isFile() || stat.size > remaining) {
						throw new Error(localize('canvasPackage.byteLimit', "The canvas package exceeds the {0}-byte limit.", this.limits.maxBytes));
					}
					const buffer = Buffer.alloc(Math.min(stat.size, remaining) + 1);
					let length = 0;
					while (length < buffer.length) {
						const read = await handle.read(buffer, length, buffer.length - length, length);
						if (!read.bytesRead) {
							break;
						}
						length += read.bytesRead;
					}
					const after = await lstat(path);
					if (length !== stat.size || after.isSymbolicLink() || after.ino !== stat.ino || after.dev !== stat.dev || await realpath(path) !== real) {
						throw new Error(localize('canvasPackage.changedDuringCopy', "The canvas package changed while it was being copied. Try again."));
					}
					totalBytes += length;
					files.push({ path: childSegments.join('/'), bytes: buffer.subarray(0, length) });
				} finally {
					await handle.close();
				}
			}
		};
		await visit(root.fsPath, []);
		return files;
	}

	private async _ensureRoot(): Promise<URI> {
		this._assertAvailable();
		this._checkCancellation(CancellationToken.None);
		if (!this._rootCreation) {
			this._rootCreation = (async () => {
				await mkdir(this._root.fsPath, { recursive: true });
				if ((await lstat(this._root.fsPath)).isSymbolicLink()) {
					throw new Error('Canvas package storage must not be a symbolic link.');
				}
				this._canonicalRoot = URI.file(await realpath(this._root.fsPath));
				return this._canonicalRoot;
			})();
		}
		try {
			return await this._rootCreation;
		} catch (error) {
			this._rootCreation = undefined;
			throw error;
		}
	}

	private _beginAuthorityChange(id: string): number {
		this._checkCancellation(CancellationToken.None);
		this._get(id);
		const version = (this._authorityVersions.get(id) ?? 0) + 1;
		this._authorityVersions.set(id, version);
		this._blocked.add(id);
		this._onDidChange.fire(id);
		return version;
	}

	private _assertAuthorityVersion(id: string, version: number): void {
		this._checkCancellation(CancellationToken.None);
		if (this._authorityVersions.get(id) !== version) {
			throw new CancellationError();
		}
	}

	private _checkCancellation(token: CancellationToken): void {
		if (token.isCancellationRequested || this._store.isDisposed) {
			throw new CancellationError();
		}
	}

	private _isExistingDirectoryError(error: unknown): boolean {
		const code = getErrorCode(error);
		return code === 'EEXIST' || code === 'ENOTEMPTY';
	}
}

export class UnsupportedCanvasPackagesService implements IAgentHostCanvasPackagesService {
	declare readonly _serviceBrand: undefined;
	readonly supported = false;
	readonly onDidChange = Event.None;
	list(): readonly IAgentHostCanvasPackage[] { return this._unsupported(); }
	prepare(): Promise<IAgentHostCanvasPackage> { return this._unsupported(); }
	approve(): Promise<void> { return this._unsupported(); }
	revoke(): Promise<void> { return this._unsupported(); }
	remove(): Promise<void> { return this._unsupported(); }
	getApprovedPluginDirectories(): Promise<readonly URI[]> { return this._unsupported(); }
	getApprovedSnapshots(): Promise<readonly ICanvasPackageSnapshot[]> { return this._unsupported(); }
	resolveLaunch(): Promise<ICanvasPackageLaunch | undefined> { return this._unsupported(); }
	isApproved(): boolean { return false; }
	private _unsupported(): never {
		throw new Error(localize('canvasPackage.unsupported', "This host does not support local canvas packages."));
	}
}
