/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { hash } from '../../../../../../base/common/hash.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { type ICustomizationRef } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { type URI as ProtocolURI } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
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

interface ISyncableFile {
	readonly uri: URI;
	readonly type: PromptsType;
}

interface IBundleResult {
	readonly ref: ICustomizationRef;
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
	 * Bundles the given files into the in-memory plugin filesystem.
	 *
	 * Overwrites any previous bundle content. Returns a {@link ICustomizationRef}
	 * pointing at the virtual plugin directory with a content-based nonce.
	 *
	 * @returns The bundle result, or `undefined` if no syncable files were provided.
	 */
	async bundle(files: readonly ISyncableFile[]): Promise<IBundleResult | undefined> {
		const syncable = files.filter(f => pluginDirForType(f.type) !== undefined);
		if (syncable.length === 0) {
			return undefined;
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

		// Read each source file and write it into the correct plugin directory,
		// collecting data for the nonce computation.
		const hashParts: string[] = [];

		for (const file of syncable) {
			const dir = pluginDirForType(file.type)!;
			const fileName = basename(file.uri);
			const destUri = URI.joinPath(this._rootUri, dir, fileName);

			const content = await this._fileService.readFile(file.uri);
			await this._fileService.writeFile(destUri, content.value);

			hashParts.push(`${dir}/${fileName}:${content.value.toString()}`);
		}

		// Stable nonce: sort so file ordering doesn't matter
		hashParts.sort();
		const nonce = String(hash(hashParts.join('\n')));

		this._lastNonce = nonce;

		return {
			ref: {
				uri: this._rootUri.toString() as ProtocolURI,
				displayName: DISPLAY_NAME,
				description: `${syncable.length} customization(s) synced from VS Code`,
				nonce,
			},
		};
	}

	/**
	 * Returns the last computed nonce, or `undefined` if no bundle has been created.
	 */
	get lastNonce(): string | undefined {
		return this._lastNonce;
	}
}
