/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { parsePlugin, type IParsedPlugin } from '../../../agentPlugins/common/pluginParsers.js';
import { readClientPluginMcpDefaultCwdOverride, toClientPluginMcpDefaultCwdsMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { CustomizationLoadStatus, CustomizationType, type ChildCustomization, type ClientPluginCustomization, type PluginCustomization } from '../../common/state/sessionState.js';

export function toChildCustomizations(plugins: readonly IParsedPlugin[]): ChildCustomization[] {
	const byId = new Map<string, ChildCustomization>();
	for (const plugin of plugins) {
		for (const child of [...plugin.agents, ...plugin.skills, ...plugin.instructions, ...plugin.hooks, ...plugin.mcpServers]) {
			if (!byId.has(child.customization.id)) {
				byId.set(child.customization.id, child.customization);
			}
		}
	}
	return [...byId.values()];
}

/**
 * Returns source-owned metadata for actual MCP servers parsed from a captured plugin.
 */
export function getCapturedPluginSourceMeta(source: PluginCustomization, parsedChildren: readonly ChildCustomization[]): Record<string, unknown> {
	const defaultCwds: Record<string, URI | null> = {};
	for (const child of parsedChildren) {
		if (child.type !== CustomizationType.McpServer) {
			continue;
		}

		const cwd = readClientPluginMcpDefaultCwdOverride(source, child.name);
		if (cwd !== undefined) {
			defaultCwds[child.name] = cwd;
		}
	}

	return Object.keys(defaultCwds).length > 0 ? toClientPluginMcpDefaultCwdsMeta(defaultCwds) : {};
}

/**
 * Parses a captured plugin directory into host-authoritative customization state.
 */
export async function parseCapturedPluginCustomization(
	captured: PluginCustomization,
	source: ClientPluginCustomization,
	pluginDir: URI,
	primaryCwd: URI | undefined,
	userHome: URI,
	fileService: IFileService,
): Promise<PluginCustomization> {
	try {
		const parsed = await parsePlugin(pluginDir, fileService, primaryCwd, userHome, pluginDir);
		const children = toChildCustomizations([parsed]).map(child => {
			if (child.type === CustomizationType.McpServer && source.childEnablement?.[child.name]) {
				return { ...child, enablement: source.childEnablement[child.name] };
			}
			return child;
		});
		const meta = getCapturedPluginSourceMeta(source, children);
		return {
			...captured,
			...(Object.keys(meta).length > 0 ? { _meta: meta } : {}),
			children,
			load: { kind: CustomizationLoadStatus.Loaded },
		};
	} catch (err) {
		return {
			...captured,
			load: { kind: CustomizationLoadStatus.Error, message: err instanceof Error ? err.message : String(err) },
		};
	}
}
