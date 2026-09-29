/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, SequencerByKey } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { basename, dirname, extUri, isEqualOrParent } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash, hashAsync } from '../../../../../../base/common/hash.js';
import { FileOperationResult, IFileService, IFileStatWithPartialMetadata, toFileOperationResult } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationSource } from '../../../common/aiCustomizationWorkspaceService.js';
import { toClientPluginMcpDefaultCwdsMeta, type ClientPluginMcpDefaultCwds } from '../../../../../../platform/agentHost/common/meta/clientPluginCustomizationMeta.js';
import { withCustomizationEnablement } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';
import { IgnoreFile } from '../../../../../../workbench/services/search/common/ignoreFile.js';

// Re-export so existing consumers don't need to change their import source.
export { SYNCED_CUSTOMIZATION_SCHEME };

const DISPLAY_NAME = 'VS Code Synced Data';
const FILE_OPERATION_CONCURRENCY = 10;
const SKILL_DIRECTORY_IGNORE = new IgnoreFile('.git\nnode_modules\n', '/', undefined, true);
const bundleSequencer = new SequencerByKey<string>();

const MANIFEST_CONTENT = JSON.stringify({
	name: DISPLAY_NAME,
	description: 'Customization data synced from VS Code',
}, null, '\t');

/**
 * Maps a {@link PromptsType} to the default plugin directory where that
 * component type is stored. This mirrors the layout used by the Open Plugin
 * format adapter in `agentPluginServiceImpl.ts`.
 *
 * Hooks are omitted — bundling hooks requires merging into `hooks/hooks.json`
 * which is deferred to a follow-up.
 */
function pluginDirForType(type: PromptsType): string | undefined {
	switch (type) {
		case PromptsType.instructions: return 'rules';
		case PromptsType.prompt: return 'commands';
		case PromptsType.agent: return 'agents';
		case PromptsType.skill: return 'skills';
		case PromptsType.hook: return undefined; // TODO: hooks require JSON merging
	}
}

type QueueFileOperation = <T>(operation: () => Promise<T>) => Promise<T>;

/** Cancels queued operations on disposal while allowing already-started operations to settle. */
class DrainingFileOperationLimiter implements IDisposable {

	private readonly _limiter = new Limiter<unknown>(FILE_OPERATION_CONCURRENCY);
	private _isDisposed = false;

	queue<T>(operation: () => Promise<T>): Promise<T> {
		if (this._isDisposed) {
			return Promise.reject(new CancellationError());
		}
		return this._limiter.queue(async () => {
			if (this._isDisposed) {
				throw new CancellationError();
			}
			return operation();
		}) as Promise<T>;
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		void this._disposeWhenIdle();
	}

	private async _disposeWhenIdle(): Promise<void> {
		await this._limiter.whenIdle();
		this._limiter.dispose();
	}
}

async function collectDirectoryFiles(fileService: IFileService, logService: ILogService, root: URI, directory: URI, queueFileOperation: QueueFileOperation): Promise<IFileStatWithPartialMetadata[]> {
	const stat = await queueFileOperation(() => fileService.resolve(directory));
	const children = (await Promise.all((stat.children ?? []).map(async child => {
		try {
			return await queueFileOperation(() => fileService.stat(child.resource));
		} catch (error) {
			if (isCancellationError(error)) {
				throw error;
			}
			logService.trace('[SyncedCustomizationBundler] Failed to stat skill resource', child.resource.toString(), error);
			return undefined;
		}
	}))).filter((child): child is IFileStatWithPartialMetadata => child !== undefined);
	const files = await Promise.all(children.map(async child => {
		const relativePath = extUri.relativePath(root, child.resource);
		if (relativePath === undefined) {
			throw new Error(`Unable to resolve skill resource path: ${child.resource.toString()}`);
		}
		if (child.isSymbolicLink || !SKILL_DIRECTORY_IGNORE.isPathIncludedInTraversal(`/${relativePath}`, child.isDirectory)) {
			return [];
		}
		if (child.isDirectory) {
			return collectDirectoryFiles(fileService, logService, root, child.resource, queueFileOperation);
		}
		return child.isFile ? [child] : [];
	}));
	return files.flat();
}

export interface ISyncableFile {
	readonly uri: URI;
	readonly type: PromptsType;
	/**
	 * Where this file originally came from (extension, plugin, built-in, ...).
	 * Optional because it is only used to populate the provenance reverse map;
	 * files without it simply have no recoverable {@link ISyncedCustomizationOrigin}.
	 */
	readonly source?: AICustomizationSource;
	/** Identifier of the contributing extension, when {@link source} is `extension`. */
	readonly extensionId?: string;
	/** Root URI of the contributing plugin, when {@link source} is `plugin`. */
	readonly pluginUri?: URI;
}

/**
 * Describes where a file bundled into the synthetic plugin originally came
 * from. The bundle flattens files from many different sources (extensions,
 * plugins, built-ins) into a single in-memory plugin, which erases their
 * provenance. {@link SyncedCustomizationBundler.getOrigin} lets consumers
 * recover it by mapping a synced (destination) URI back to this record.
 */
export interface ISyncedCustomizationOrigin {
	/** The original local file URI before it was copied into the synthetic bundle. */
	readonly uri: URI;
	/** Where the file originally came from (extension, plugin, built-in, ...). */
	readonly source: AICustomizationSource;
	/** Identifier of the contributing extension, when {@link source} is `extension`. */
	readonly extensionId?: string;
	/** Root URI of the contributing plugin, when {@link source} is `plugin`. */
	readonly pluginUri?: URI;
}

/**
 * An MCP server configured directly in VS Code (i.e. not contributed by an
 * agent plugin) that should be bundled into the synthetic plugin so the
 * agent host can launch it.
 */
export interface ISyncableMcpServer {
	readonly name: string;
	readonly configuration: IMcpServerConfiguration;
	readonly defaultCwd?: URI;
	readonly enablement: readonly CustomizationEnablement[];
}

interface IBundleResult {
	readonly ref: ClientPluginCustomization;
}

export interface ISyncedCustomizationBundleSnapshot extends IDisposable {
	readonly customizations: readonly ClientPluginCustomization[];
	readonly rewriteUri: (uri: string) => string;
}

/**
 * Bundles individual customization files into a synthetic Open Plugin
 * backed by an in-memory filesystem.
 *
 * Each bundler instance is namespaced by its authority string so that
 * multiple agent workspace scopes can coexist under the same scheme without
 * conflicts.
 * The plugin is mounted at `vscode-synced-customization:///{authority}/`
 * and structured as:
 *
 * ```
 * .plugin/plugin.json
 * .mcp.json        ← MCP servers configured in VS Code
 * rules/          ← instruction files
 * commands/       ← prompt files
 * agents/         ← agent files
 * skills/         ← skill directories
 * ```
 *
 * The bundler computes a content-based nonce so the agent host can
 * skip re-loading when nothing has changed.
 */
export class SyncedCustomizationBundler extends Disposable {

	private readonly _fileOperationLimiter = this._register(new DrainingFileOperationLimiter());
	private readonly _authority: string;
	private _lastNonce: string | undefined;
	private _lastRef: IBundleResult | undefined;
	private _lastFileContents: readonly { readonly destUri: URI; readonly content: VSBuffer }[] = [];
	private _lastMcpContent: string | undefined;
	private _isDisposed = false;
	/** Maps a synced (destination) URI string back to its original source location. Rebuilt on every {@link bundle}. */
	private _originByDest = new ResourceMap<ISyncedCustomizationOrigin>();
	/** Maps an original source URI to the path contributed to the synthetic plugin. */
	private _destinationBySource = new ResourceMap<URI>();
	private readonly _snapshotRefCounts = new Map<string, number>();
	private readonly _snapshotOrigins = new Map<string, ResourceMap<ISyncedCustomizationOrigin>>();

	constructor(
		authority: string,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostFileSystemService agentHostFileSystemService: IAgentHostFileSystemService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._authority = authority;
		agentHostFileSystemService.ensureSyncedCustomizationProvider();
	}

	/**
	 * Root URI of the virtual plugin directory for this bundler.
	 * The authority is encoded into the path (not the URI authority) because
	 * {@link InMemoryFileSystemProvider} only routes by path.
	 */
	private get _rootUri(): URI {
		return URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: `/${this._authority}` });
	}

	private _queueFileOperation<T>(operation: () => Promise<T>): Promise<T> {
		this._throwIfDisposed();
		return this._fileOperationLimiter.queue(operation);
	}

	private _throwIfDisposed(): void {
		if (this._isDisposed) {
			throw new CancellationError();
		}
	}

	/**
	 * Bundles the given files and MCP servers into the in-memory plugin
	 * filesystem.
	 *
	 * Overwrites any previous bundle content. Returns a {@link ClientPluginCustomization}
	 * pointing at the virtual plugin directory with a content-based nonce.
	 *
	 * @returns The bundle result, or `undefined` if there is nothing to sync.
	 */
	async bundle(files: readonly ISyncableFile[], mcpServers: readonly ISyncableMcpServer[] = []): Promise<IBundleResult | undefined> {
		this._throwIfDisposed();
		try {
			const result = await bundleSequencer.queue(this._authority, () => this._bundle(files, mcpServers));
			this._throwIfDisposed();
			return result;
		} catch (error) {
			this._throwIfDisposed();
			throw error;
		}
	}

	/**
	 * Creates an immutable virtual-plugin copy for a mutation that must remain
	 * readable while the host captures the client-served resource.
	 */
	async acquireSnapshot(customizations: readonly ClientPluginCustomization[]): Promise<ISyncedCustomizationBundleSnapshot> {
		this._throwIfDisposed();
		const snapshot = await bundleSequencer.queue(this._authority, async () => {
			this._throwIfDisposed();
			const current = this._lastRef?.ref;
			const bundleRef = customizations.find(customization => customization.uri === this._rootUri.toString());
			if (!bundleRef) {
				return undefined;
			}
			if (!current || !this._lastNonce) {
				throw new Error('The customization bundle is no longer available for an immutable Automation snapshot.');
			}
			const index = customizations.findIndex(customization => customization.uri === current.uri && customization.nonce === current.nonce);
			if (index === -1) {
				throw new Error('The customization bundle changed before an immutable Automation snapshot could be acquired.');
			}
			const nonce = this._lastNonce;
			const snapshotRoot = this._snapshotRootUri(nonce);
			const snapshotUrisBySource = new ResourceMap<URI>();
			if (!this._snapshotRefCounts.has(nonce)) {
				await this._writeBundle(snapshotRoot, this._lastFileContents, this._lastMcpContent);
				const origins = new ResourceMap<ISyncedCustomizationOrigin>();
				for (const [destination, origin] of this._originByDest) {
					const relative = extUri.relativePath(this._rootUri, destination);
					if (relative !== undefined) {
						origins.set(URI.joinPath(snapshotRoot, relative), origin);
					}
				}
				this._snapshotOrigins.set(nonce, origins);
			}
			for (const [source, destination] of this._destinationBySource) {
				const relative = extUri.relativePath(this._rootUri, destination);
				if (relative !== undefined) {
					snapshotUrisBySource.set(source, URI.joinPath(snapshotRoot, relative));
				}
			}
			this._snapshotRefCounts.set(nonce, (this._snapshotRefCounts.get(nonce) ?? 0) + 1);
			const uri = snapshotRoot.toString() as ProtocolURI;
			const snapshotRef: ClientPluginCustomization = {
				...current,
				uri,
			};
			return {
				nonce,
				root: snapshotRoot,
				sourceUris: snapshotUrisBySource,
				customizations: customizations.map((customization, candidate) => candidate === index ? snapshotRef : customization),
			};
		});
		this._throwIfDisposed();
		if (!snapshot) {
			return { customizations, rewriteUri: uri => uri, dispose: () => { } };
		}
		let disposed = false;
		return {
			customizations: snapshot.customizations,
			rewriteUri: uri => {
				try {
					const source = URI.parse(uri);
					const snapshotSource = snapshot.sourceUris.get(source);
					if (snapshotSource) {
						return snapshotSource.toString();
					}
					if (!isEqualOrParent(source, this._rootUri)) {
						return uri;
					}
					const relative = extUri.relativePath(this._rootUri, source);
					return relative === undefined ? uri : URI.joinPath(snapshot.root, relative).toString();
				} catch {
					return uri;
				}
			},
			dispose: () => {
				if (!disposed) {
					disposed = true;
					void this._releaseSnapshot(snapshot.nonce);
				}
			},
		};
	}

	private async _bundle(files: readonly ISyncableFile[], mcpServers: readonly ISyncableMcpServer[]): Promise<IBundleResult | undefined> {
		this._throwIfDisposed();
		const syncable = files.filter(f => pluginDirForType(f.type) !== undefined);
		if (syncable.length === 0 && mcpServers.length === 0) {
			return undefined;
		}

		const entries: { sourceUri: URI; destUri: URI; hashKey: string }[] = [];
		const originByDest = new ResourceMap<ISyncedCustomizationOrigin>();
		const destinationBySource = new ResourceMap<URI>();
		const addEntry = (file: ISyncableFile, sourceUri: URI, destUri: URI, hashKey: string): void => {
			entries.push({ sourceUri, destUri, hashKey });
			destinationBySource.set(sourceUri, destUri);
			if (file.source !== undefined) {
				originByDest.set(destUri, {
					uri: sourceUri,
					source: file.source,
					extensionId: file.extensionId,
					pluginUri: file.pluginUri,
				});
			}
		};
		await Promise.all(syncable.map(async file => {
			const dir = pluginDirForType(file.type)!;
			const fileName = basename(file.uri);

			// Skills are conventionally directories containing SKILL.md.
			// The file locator returns the SKILL.md URI, so basename is
			// always "SKILL.md" — which would cause every skill to collide.
			// Preserve the directory structure: skills/{skillName}/SKILL.md.
			if (file.type === PromptsType.skill && fileName.toLowerCase() === 'skill.md') {
				const skillRoot = dirname(file.uri);
				const skillDirName = basename(skillRoot);
				addEntry(file, file.uri, URI.joinPath(this._rootUri, dir, skillDirName, fileName), `${dir}/${skillDirName}/${fileName}`);
				for (const source of await collectDirectoryFiles(this._fileService, this._logService, skillRoot, skillRoot, operation => this._queueFileOperation(operation))) {
					if (extUri.isEqual(source.resource, file.uri)) {
						continue;
					}
					const relativePath = extUri.relativePath(skillRoot, source.resource);
					if (relativePath === undefined) {
						throw new Error(`Unable to resolve skill resource path: ${source.resource.toString()}`);
					}
					addEntry(
						file,
						source.resource,
						URI.joinPath(this._rootUri, dir, skillDirName, relativePath),
						`${dir}/${skillDirName}/${relativePath}`,
					);
				}
			} else {
				addEntry(file, file.uri, URI.joinPath(this._rootUri, dir, fileName), `${dir}/${fileName}`);
			}
		}));
		this._throwIfDisposed();

		// Write MCP servers into `.mcp.json`. The agent host's Open Plugin
		// adapter reads this file relative to the plugin root. Servers are
		// sorted by name so the serialized content (and nonce) is stable.
		let mcpContent: string | undefined;
		let mcpDefaultCwds: ClientPluginMcpDefaultCwds | undefined;
		const childEnablement: Record<string, CustomizationEnablement[]> = {};
		if (mcpServers.length > 0) {
			const servers: Record<string, IMcpServerConfiguration> = {};
			const defaultCwds: Record<string, URI | null> = {};
			for (const server of [...mcpServers].sort((a, b) => a.name.localeCompare(b.name))) {
				// Deliberately retain disabled servers: step 4's host gate must
				// apply childEnablement before the SDK discovers this `.mcp.json`.
				servers[server.name] = server.configuration;
				defaultCwds[server.name] = server.defaultCwd ?? null;
				childEnablement[server.name] = server.enablement.slice();
			}
			mcpDefaultCwds = defaultCwds;
			mcpContent = JSON.stringify({ mcpServers: servers }, null, '\t');
		}

		// Same-size edits can preserve mtime, so metadata cannot replace a content check.
		const fileContents = await Promise.all(entries.map(async entry => ({
			destUri: entry.destUri,
			hashKey: entry.hashKey,
			content: (await this._queueFileOperation(() => this._fileService.readFile(entry.sourceUri))).value,
		})));
		this._throwIfDisposed();

		const contentHashParts = await Promise.all(fileContents.map(async entry => `${entry.hashKey}:${await hashAsync(entry.content)}`));
		if (mcpContent !== undefined) {
			contentHashParts.push(`.mcp.json:${mcpContent}`);
		}
		if (mcpDefaultCwds !== undefined) {
			contentHashParts.push(`mcpDefaultCwds:${JSON.stringify(toClientPluginMcpDefaultCwdsMeta(mcpDefaultCwds))}`);
		}
		contentHashParts.sort();
		const nonce = String(hash(contentHashParts.join('\n')));
		this._throwIfDisposed();

		if (nonce === this._lastNonce && this._lastRef) {
			return this._reuseLastBundle(this._lastRef, originByDest, childEnablement, mcpServers.length > 0);
		}

		this._lastNonce = undefined;
		this._lastRef = undefined;
		this._originByDest.clear();
		await this._writeBundle(this._rootUri, fileContents, mcpContent);

		this._throwIfDisposed();
		this._originByDest = originByDest;
		this._destinationBySource = destinationBySource;
		this._lastNonce = nonce;
		this._lastFileContents = fileContents;
		this._lastMcpContent = mcpContent;

		const rootUriString = this._rootUri.toString() as ProtocolURI;
		const result: IBundleResult = {
			ref: {
				type: CustomizationType.Plugin,
				id: customizationId(rootUriString),
				uri: rootUriString,
				name: DISPLAY_NAME,
				nonce,
				_meta: mcpDefaultCwds ? toClientPluginMcpDefaultCwdsMeta(mcpDefaultCwds) : undefined,
				enablement: withCustomizationEnablement(undefined, CustomizationEnablementKind.Global, {
					kind: CustomizationEnablementKind.Global,
					enabled: true,
				}),
				...(mcpServers.length > 0 ? { childEnablement } : {}),
			},
		};
		this._lastRef = result;
		return result;
	}

	private _reuseLastBundle(lastRef: IBundleResult, originByDest: ResourceMap<ISyncedCustomizationOrigin>, childEnablement: Record<string, CustomizationEnablement[]>, hasMcpServers: boolean): IBundleResult {
		this._originByDest = originByDest;
		if (hasMcpServers && !equals(childEnablement, lastRef.ref.childEnablement)) {
			this._lastRef = {
				ref: {
					...lastRef.ref,
					childEnablement,
				},
			};
			return this._lastRef;
		}

		return lastRef;
	}

	private _snapshotRootUri(nonce: string): URI {
		return URI.from({ scheme: SYNCED_CUSTOMIZATION_SCHEME, path: `/${this._authority}.automation-snapshots/${nonce}` });
	}

	private async _writeBundle(root: URI, fileContents: readonly { readonly destUri: URI; readonly content: VSBuffer }[], mcpContent: string | undefined): Promise<void> {
		try {
			await this._fileService.del(root, { recursive: true });
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this._logService.error('[SyncedCustomizationBundler] Failed to delete customization bundle', root.toString(), error);
				throw error;
			}
		}
		this._throwIfDisposed();
		await this._fileService.writeFile(URI.joinPath(root, '.plugin', 'plugin.json'), VSBuffer.fromString(MANIFEST_CONTENT));
		for (const entry of fileContents) {
			this._throwIfDisposed();
			const relative = extUri.relativePath(this._rootUri, entry.destUri);
			if (relative === undefined) {
				throw new Error(`Unable to resolve bundled customization path: ${entry.destUri.toString()}`);
			}
			await this._fileService.writeFile(URI.joinPath(root, relative), entry.content);
		}
		if (mcpContent !== undefined) {
			this._throwIfDisposed();
			await this._fileService.writeFile(URI.joinPath(root, '.mcp.json'), VSBuffer.fromString(mcpContent));
		}
	}

	private async _releaseSnapshot(nonce: string): Promise<void> {
		await bundleSequencer.queue(this._authority, async () => {
			const refCount = (this._snapshotRefCounts.get(nonce) ?? 1) - 1;
			if (refCount > 0) {
				this._snapshotRefCounts.set(nonce, refCount);
				return;
			}
			this._snapshotRefCounts.delete(nonce);
			this._snapshotOrigins.delete(nonce);
			try {
				await this._fileService.del(this._snapshotRootUri(nonce), { recursive: true });
			} catch (error) {
				if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
					this._logService.error('[SyncedCustomizationBundler] Failed to delete Automation customization snapshot', nonce, error);
				}
			}
		});
	}

	/**
	 * Returns the last computed nonce, or `undefined` if no bundle has been created.
	 */
	get lastNonce(): string | undefined {
		return this._lastNonce;
	}

	isBundledMcpServer(pluginUri: string, serverName: string): boolean {
		return this._lastRef?.ref.uri === pluginUri
			&& Object.hasOwn(this._lastRef.ref.childEnablement ?? {}, serverName);
	}

	/**
	 * Recovers the original provenance of a file that was flattened into the
	 * synthetic bundle, given its synced (destination) URI. Returns `undefined`
	 * for URIs that are not part of the most recent bundle.
	 */
	getOrigin(syncedUri: URI): ISyncedCustomizationOrigin | undefined {
		return this._originByDest.get(syncedUri)
			?? [...this._snapshotOrigins.values()].find(origins => origins.get(syncedUri) !== undefined)?.get(syncedUri);
	}

	override dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		super.dispose();
	}
}
