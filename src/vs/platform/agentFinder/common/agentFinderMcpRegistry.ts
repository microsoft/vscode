/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMcpGalleryManifest } from '../../mcp/common/mcpGalleryManifest.js';
import { localize } from '../../../nls.js';

export const agentFinderMcpRegistryManifest: IMcpGalleryManifest = {
	version: 'v0.1',
	url: 'https://api.mcp.github.com/oss/v0.1/servers',
	resources: [],
};

export function isValidAgentFinderMcpIdentity(name: string, version: string): boolean {
	return name.length <= 512 && /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(name) &&
		version.length <= 128 && /^[a-z0-9][a-z0-9._+-]*$/i.test(version) && !version.includes('..');
}

export function getAgentFinderMcpServerUrl(name: string, version: string): string {
	if (!isValidAgentFinderMcpIdentity(name, version)) {
		throw new Error(localize('agentFinder.invalidMcpSource', "The MCP server's installation source is invalid."));
	}
	return `${agentFinderMcpRegistryManifest.url}/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}`;
}
