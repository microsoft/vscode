/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionRequest } from '@github/copilot-sdk';
import { Schemas } from '../../../../base/common/network.js';
import { joinPath } from '../../../../base/common/resources.js';
import { stripUTF8BOM } from '../../../../base/common/strings.js';
import { isString, isStringArray } from '../../../../base/common/types.js';
import type { URI } from '../../../../base/common/uri.js';
import type { IFileService } from '../../../files/common/files.js';

type ExtensionPermissionAccessRequest = Extract<PermissionRequest, { kind: 'extension-permission-access' }>;

/**
 * Capabilities an extension of an applied plugin may load with, in the runtime's wording. Hooks are a
 * declared plugin feature (`hooks.json`) the user admitted by enabling the plugin; answering, observing
 * or skipping permission prompts are not.
 */
const PLUGIN_EXTENSION_CAPABILITIES: ReadonlySet<string> = new Set(['register hooks']);

/** The runtime names a plugin's extension `plugin:<plugin name>:<extension directory>`. */
const PLUGIN_EXTENSION_NAME = /^plugin:(?<plugin>[^:]+):(?<extension>[^:/\\]+)$/;

/** Every manifest from which the runtime may take a plugin directory's name. */
const PLUGIN_MANIFEST_PATHS = ['plugin.json', '.plugin/plugin.json', '.github/plugin/plugin.json', '.claude-plugin/plugin.json'];

export type CopilotExtensionConsentDecision =
	| { readonly approve: true; readonly pluginName: string; readonly capabilities: readonly string[] }
	| { readonly approve: false; readonly reason: string };

/**
 * Decides an extension's load-time consent request, which the runtime asks while the session starts,
 * before any turn or tool call can carry a confirmation. Approves only hook registration by an extension
 * of a plugin this session delivered through `pluginDirectories`; anything else is refused.
 */
export async function decideCopilotExtensionConsent(
	request: ExtensionPermissionAccessRequest,
	appliedPlugins: readonly { readonly pluginDir?: URI }[],
	fileService: IFileService,
): Promise<CopilotExtensionConsentDecision> {
	// The raw marker stays authoritative for prompt kinds other than commands, read, write, url and workflow.
	if (request.managedApprovalRequired === true) {
		return { approve: false, reason: 'managed approval is required' };
	}
	const capabilities: unknown = request.capabilities;
	if (!isStringArray(capabilities) || capabilities.length === 0 || !capabilities.every(capability => PLUGIN_EXTENSION_CAPABILITIES.has(capability))) {
		return { approve: false, reason: 'it requests capabilities other than hook registration' };
	}
	const pluginName = isString(request.extensionName) ? PLUGIN_EXTENSION_NAME.exec(request.extensionName)?.groups?.plugin : undefined;
	if (!pluginName) {
		return { approve: false, reason: 'it is not a plugin extension' };
	}
	const pluginDirectories = appliedPlugins.flatMap(plugin => plugin.pluginDir?.scheme === Schemas.file ? [plugin.pluginDir] : []);
	const appliedNames = await Promise.all(pluginDirectories.map(directory => readPluginDirectoryName(directory, fileService)));
	if (!appliedNames.includes(pluginName)) {
		return { approve: false, reason: `no plugin applied to this session is named '${pluginName}'` };
	}
	return { approve: true, pluginName, capabilities };
}

/**
 * Reads the name the runtime gives a plugin directory: its manifest's `name`. The runtime prefers one
 * manifest location over another, so every manifest present must agree. A directory without a named
 * manifest, which the runtime names after the directory instead, is not attributed.
 */
async function readPluginDirectoryName(pluginDirectory: URI, fileService: IFileService): Promise<string | undefined> {
	const manifests = await Promise.all(PLUGIN_MANIFEST_PATHS.map(path => readManifestName(joinPath(pluginDirectory, path), fileService)));
	const present = manifests.filter(manifest => manifest.exists);
	const names = new Set(present.map(manifest => manifest.name));
	const [name] = names;
	return names.size === 1 ? name : undefined;
}

async function readManifestName(manifest: URI, fileService: IFileService): Promise<{ readonly exists: false } | { readonly exists: true; readonly name: string | undefined }> {
	if (!await fileService.exists(manifest)) {
		return { exists: false };
	}
	try {
		// The runtime skips a byte order mark too. JSON can hold any value; reading `name` off a primitive yields `undefined`.
		const parsed: { readonly name?: unknown } | null = JSON.parse(stripUTF8BOM((await fileService.readFile(manifest)).value.toString()));
		const name = parsed?.name;
		return { exists: true, name: isString(name) && name ? name : undefined };
	} catch {
		return { exists: true, name: undefined };
	}
}
