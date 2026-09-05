/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../../base/common/objects.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { basename, dirname, extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IFileService, IFileStatWithPartialMetadata } from '../../../../../../platform/files/common/files.js';
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

async function collectDirectoryFiles(fileService: IFileService, logService: ILogService, root: URI, directory: URI, queueFileOperation: QueueFileOperation): Promise<IFileStatWithPartialMetadata[]> {
	const stat = await queueFileOperation(() => fileService.resolve(directory));
	const children = (await Promise.all((stat.children ?? []).map(async child => {
		try {
			return await queueFileOperation(() => fileService.stat(child.resource));
		} catch (error) {
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
 * The bundler computes a metadata-based nonce so the agent host can
 * skip re-loading when nothing has changed.
 */
export class SyncedCustomizationBundler extends Disposable {

	private readonly _fileOperationLimiter = this._register(new Limiter<unknown>(FILE_OPERATION_CONCURRENCY));
	private readonly _authority: string;
	private _lastNonce: string | undefined;
	private _lastRef: IBundleResult | undefined;
	/** Maps a synced (destination) URI string back to its original source location. Rebuilt on every {@link bundle}. */
	private _originByDest = new ResourceMap<ISyncedCustomizationOrigin>();

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
		return this._fileOperationLimiter.queue(operation) as Promise<T>;
	}

	/**
	 * Bundles the given files and MCP servers into the in-memory plugin
	 * filesystem.
	 *
	 * Overwrites any previous bundle content. Returns a {@link ClientPluginCustomization}
	 * pointing at the virtual plugin directory with a metadata-based nonce.
	 *
	 * @returns The bundle result, or `undefined` if there is nothing to sync.
	 */
	async bundle(files: readonly ISyncableFile[], mcpServers: readonly ISyncableMcpServer[] = []): Promise<IBundleResult | undefined> {
		const syncable = files.filter(f => pluginDirForType(f.type) !== undefined);
		if (syncable.length === 0 && mcpServers.length === 0) {
			return undefined;
		}

		const entries: { sourceUri: URI; destUri: URI; hashPart: string }[] = [];
		const originByDest = new ResourceMap<ISyncedCustomizationOrigin>();
		const addEntry = (file: ISyncableFile, source: IFileStatWithPartialMetadata, destUri: URI, hashKey: string): void => {
			entries.push({ sourceUri: source.resource, destUri, hashPart: `${hashKey}:${source.mtime}:${source.size}` });
			if (file.source !== undefined) {
				originByDest.set(destUri, {
					uri: source.resource,
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
				const entrypoint = await this._queueFileOperation(() => this._fileService.stat(file.uri));
				addEntry(file, entrypoint, URI.joinPath(this._rootUri, dir, skillDirName, fileName), `${dir}/${skillDirName}/${fileName}`);
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
						source,
						URI.joinPath(this._rootUri, dir, skillDirName, relativePath),
						`${dir}/${skillDirName}/${relativePath}`,
					);
				}
			} else {
				const source = await this._queueFileOperation(() => this._fileService.stat(file.uri));
				addEntry(file, source, URI.joinPath(this._rootUri, dir, fileName), `${dir}/${fileName}`);
			}
		}));

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

		const hashParts = entries.map(e => e.hashPart);
		if (mcpContent !== undefined) {
			hashParts.push(`.mcp.json:${mcpContent}`);
		}
		if (mcpDefaultCwds !== undefined) {
			hashParts.push(`mcpDefaultCwds:${JSON.stringify(toClientPluginMcpDefaultCwdsMeta(mcpDefaultCwds))}`);
		}

		// Stable nonce: sort so file ordering doesn't matter.
		hashParts.sort();
		const nonce = String(hash(hashParts.join('\n')));

		// Nothing changed since the last successful bundle — reuse it and skip
		// reading file contents and rewriting the in-memory plugin tree.
		if (nonce === this._lastNonce && this._lastRef) {
			this._originByDest = originByDest;
			if (mcpServers.length > 0 && !equals(childEnablement, this._lastRef.ref.childEnablement)) {
				return {
					ref: {
						...this._lastRef.ref,
						childEnablement,
					},
				};
			}
			return this._lastRef;
		}

		const fileContents = await Promise.all(entries.map(async entry => ({
			destUri: entry.destUri,
			content: (await this._queueFileOperation(() => this._fileService.readFile(entry.sourceUri))).value,
		})));
		this._originByDest = originByDest;

		// Delete the previous tree for this authority, preserving other authorities
		try {
			await this._fileService.del(this._rootUri, { recursive: true });
		} catch {
			// Directory may not exist on first bundle
		}

		// Write the manifest
		const manifestUri = URI.joinPath(this._rootUri, '.plugin', 'plugin.json');
		await this._fileService.writeFile(manifestUri, VSBuffer.fromString(MANIFEST_CONTENT));

		// Write each source file into the correct plugin directory.
		for (const entry of fileContents) {
			await this._fileService.writeFile(entry.destUri, entry.content);
		}

		// Write MCP servers into `.mcp.json`. The agent host's Open Plugin
		// adapter reads this file relative to the plugin root.
		if (mcpContent !== undefined) {
			const mcpUri = URI.joinPath(this._rootUri, '.mcp.json');
			await this._fileService.writeFile(mcpUri, VSBuffer.fromString(mcpContent));
		}

		this._lastNonce = nonce;

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
		return this._originByDest.get(syncedUri);
	}
}
