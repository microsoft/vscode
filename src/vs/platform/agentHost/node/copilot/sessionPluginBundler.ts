/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { IAgentPluginManager } from '../../common/agentPluginManager.js';
import type { CustomizationRef } from '../../common/state/sessionState.js';
import type { URI as ProtocolURI } from '../../common/state/protocol/state.js';
import { DiscoveredType, type IDiscoveredFile } from './sessionCustomizationDiscovery.js';

const DISPLAY_NAME = 'VS Code Synced Data';
const HOST_DISCOVERY_DIR = 'host-discovery';

const MANIFEST_CONTENT = JSON.stringify({
	name: DISPLAY_NAME,
	description: 'Customization data discovered from this workspace and your home directory',
}, null, '\t');

/**
 * Maps a {@link DiscoveredType} to the plugin sub-directory under which that
 * component type lives in the Open Plugin format.
 */
function pluginDirForType(type: DiscoveredType): string {
	switch (type) {
		case DiscoveredType.Agent: return 'agents';
		case DiscoveredType.Skill: return 'skills';
		case DiscoveredType.Instruction: return 'rules';
	}
}

interface IBundleResult {
	readonly ref: CustomizationRef;
}

/**
 * Bundles host-discovered customization files into an Open Plugin layout
 * on real disk under `<agentPluginManager.basePath>/host-discovery/<hash>/`.
 *
 * Writing to a real directory (rather than an in-memory provider) is
 * required because the Copilot SDK subprocess receives skill directories
 * and hook commands as on-disk paths via `fsPath`, and because the
 * workbench fetches files through the agent-host filesystem bridge —
 * neither of which can read a host-side in-memory FS.
 *
 * The directory is namespaced by a hash of the working directory so
 * concurrent sessions on different folders don't collide. Repeated
 * `bundle()` calls with identical content reuse the prior bundle (nonce
 * match) and skip the rewrite.
 */
export class SessionPluginBundler extends Disposable {

	private readonly _rootUri: URI;
	private _lastNonce: string | undefined;

	constructor(
		workingDirectory: URI,
		@IFileService private readonly _fileService: IFileService,
		@IAgentPluginManager pluginManager: IAgentPluginManager,
	) {
		super();
		const authority = `host-${hash(workingDirectory.toString())}`;
		this._rootUri = URI.joinPath(pluginManager.basePath, HOST_DISCOVERY_DIR, authority);
	}

	get rootUri(): URI {
		return this._rootUri;
	}

	get lastNonce(): string | undefined {
		return this._lastNonce;
	}

	/**
	 * Bundles the given files into the on-disk plugin directory.
	 *
	 * Overwrites any previous bundle for this working directory. Returns a
	 * {@link CustomizationRef} pointing at the on-disk plugin root with a
	 * content-based nonce, or `undefined` when there are no files.
	 */
	async bundle(files: readonly IDiscoveredFile[]): Promise<IBundleResult | undefined> {
		if (files.length === 0) {
			return undefined;
		}

		try {
			await this._fileService.del(this._rootUri, { recursive: true });
		} catch {
			// Directory may not exist on first bundle.
		}

		const manifestUri = URI.joinPath(this._rootUri, '.plugin', 'plugin.json');
		await this._fileService.writeFile(manifestUri, VSBuffer.fromString(MANIFEST_CONTENT));

		const hashParts: string[] = [];

		for (const file of files) {
			const dir = pluginDirForType(file.type);
			const fileName = basename(file.uri);

			let destUri: URI;
			let hashKey: string;
			if (file.type === DiscoveredType.Skill) {
				// Skills are conventionally `<skillName>/SKILL.md`. Preserve the
				// containing directory name so multiple skills don't collide.
				const skillDirName = basename(dirname(file.uri));
				destUri = URI.joinPath(this._rootUri, dir, skillDirName, fileName);
				hashKey = `${dir}/${skillDirName}/${fileName}`;
			} else {
				destUri = URI.joinPath(this._rootUri, dir, fileName);
				hashKey = `${dir}/${fileName}`;
			}

			const content = await this._fileService.readFile(file.uri);
			await this._fileService.writeFile(destUri, content.value);
			hashParts.push(`${hashKey}:${content.value.toString()}`);
		}

		hashParts.sort();
		const nonce = String(hash(hashParts.join('\n')));
		this._lastNonce = nonce;

		return {
			ref: {
				uri: this._rootUri.toString() as ProtocolURI,
				displayName: DISPLAY_NAME,
				description: `${files.length} customization(s) discovered for this session`,
				nonce,
			},
		};
	}
}
