/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IMcpServerConfiguration } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { AICustomizationSource } from '../../../common/aiCustomizationWorkspaceService.js';
import { customizationId, type ClientPluginCustomization } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { CustomizationType, type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostFileSystemService, SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js';

// Re-export so existing consumers don't need to change their import source.
export { SYNCED_CUSTOMIZATION_SCHEME };

const DISPLAY_NAME = 'VS Code Synced Data';

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
}

interface IBundleResult {
	readonly ref: ClientPluginCustomization;
}

/**
 * Bundles individual customization files into a synthetic Open Plugin
 * backed by an in-memory filesystem.
 *
 * Each bundler instance is namespaced by its authority string so that
 * multiple agents can coexist under the same scheme without conflicts.
 * The plugin is mounted at `vscode-synced-customization:///{authority}/`
 * and structured as:
 *
 * ```
 * .plugin/plugin.json
 * .mcp.json        ← MCP servers configured in VS Code
 * rules/          ← instruction files
 * commands/       ← prompt files
 * agents/         ← agent files
 * skills/         ← skill files
 * ```
 *
 * The bundler computes a content-based nonce so the agent host can
 * skip re-loading when nothing has changed.
 */
export class SyncedCustomizationBundler extends Disposable {

	private readonly _authority: string;
	private _lastNonce: string | undefined;
	private _lastRef: IBundleResult | undefined;
	/** Maps a synced (destination) URI string back to its original source location. Rebuilt on every {@link bundle}. */
	private _originByDest = new Map<string, ISyncedCustomizationOrigin>();

	constructor(
		authority: string,
		@IFileService private readonly _fileService: IFileService,
		@IAgentHostFileSystemService agentHostFileSystemService: IAgentHostFileSystemService,
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
		const syncable = files.filter(f => pluginDirForType(f.type) !== undefined);
		if (syncable.length === 0 && mcpServers.length === 0) {
			return undefined;
		}

		// Read every source file up front so the content nonce can be computed
		// before touching the in-memory tree. This lets us skip the destructive
		// delete + rewrite entirely when nothing has changed since the last
		// bundle (a frequent case when a change event fires but content is
		// identical).
		const entries: { destUri: URI; content: VSBuffer; hashPart: string }[] = [];
		const originByDest = new Map<string, ISyncedCustomizationOrigin>();
		await Promise.all(syncable.map(async file => {
			const dir = pluginDirForType(file.type)!;
			const fileName = basename(file.uri);

			// Skills are conventionally directories containing SKILL.md.
			// The file locator returns the SKILL.md URI, so basename is
			// always "SKILL.md" — which would cause every skill to collide.
			// Preserve the directory structure: skills/{skillName}/SKILL.md.
			let destUri: URI;
			let hashKey: string;
			if (file.type === PromptsType.skill && fileName.toLowerCase() === 'skill.md') {
				const skillDirName = basename(dirname(file.uri));
				destUri = URI.joinPath(this._rootUri, dir, skillDirName, fileName);
				hashKey = `${dir}/${skillDirName}/${fileName}`;
			} else {
				destUri = URI.joinPath(this._rootUri, dir, fileName);
				hashKey = `${dir}/${fileName}`;
			}

			// Record the reverse mapping so the flattened file's original
			// provenance (extension/plugin/built-in) can be recovered later.
			// Only files that carry a source have recoverable provenance.
			if (file.source !== undefined) {
				originByDest.set(destUri.toString(), {
					uri: file.uri,
					source: file.source,
					extensionId: file.extensionId,
					pluginUri: file.pluginUri,
				});
			}

			const content = await this._fileService.readFile(file.uri);
			entries.push({ destUri, content: content.value, hashPart: `${hashKey}:${content.value.toString()}` });
		}));

		// Publish the freshly computed provenance map. This is done before the
		// nonce short-circuit below so the map always reflects the latest set of
		// bundled files, even when the content nonce is unchanged.
		this._originByDest = originByDest;

		// Write MCP servers into `.mcp.json`. The agent host's Open Plugin
		// adapter reads this file relative to the plugin root. Servers are
		// sorted by name so the serialized content (and nonce) is stable.
		let mcpContent: string | undefined;
		if (mcpServers.length > 0) {
			const servers: Record<string, IMcpServerConfiguration> = {};
			for (const server of [...mcpServers].sort((a, b) => a.name.localeCompare(b.name))) {
				servers[server.name] = server.configuration;
			}
			mcpContent = JSON.stringify({ mcpServers: servers }, null, '\t');
		}

		const hashParts = entries.map(e => e.hashPart);
		if (mcpContent !== undefined) {
			hashParts.push(`.mcp.json:${mcpContent}`);
		}

		// Stable nonce: sort so file ordering doesn't matter.
		hashParts.sort();
		const nonce = String(hash(hashParts.join('\n')));

		// Nothing changed since the last successful bundle — reuse it and skip
		// the delete + rewrite of the in-memory plugin tree.
		if (nonce === this._lastNonce && this._lastRef) {
			return this._lastRef;
		}

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
		for (const entry of entries) {
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
				enabled: true,
				nonce,
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

	/**
	 * Recovers the original provenance of a file that was flattened into the
	 * synthetic bundle, given its synced (destination) URI. Returns `undefined`
	 * for URIs that are not part of the most recent bundle.
	 */
	getOrigin(syncedUri: URI): ISyncedCustomizationOrigin | undefined {
		return this._originByDest.get(syncedUri.toString());
	}
}
