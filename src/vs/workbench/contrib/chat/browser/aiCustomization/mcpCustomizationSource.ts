/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { McpServerSource } from '../../../../../platform/agentHost/common/meta/mcpCustomizationMeta.js';
import { AICustomizationSource, AICustomizationSources } from '../../common/aiCustomizationWorkspaceService.js';

/** Maps an MCP server's configuration source to the customization group it is listed under. */
export function getMcpCustomizationSource(source: McpServerSource | undefined, hasHostConfiguration = false): AICustomizationSource {
	switch (source) {
		case 'user':
			return AICustomizationSources.user;
		case 'workspace':
			return AICustomizationSources.local;
		case 'plugin':
			return AICustomizationSources.plugin;
		case undefined:
			if (hasHostConfiguration) {
				return AICustomizationSources.user;
			}
	}
	return AICustomizationSources.builtin;
}
