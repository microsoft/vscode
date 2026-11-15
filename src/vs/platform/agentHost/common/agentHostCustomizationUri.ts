/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { fromAgentHostUri } from './agentHostUri.js';
import { buildMcpResourceUri } from './mcpResourceUri.js';

/**
 * URI scheme for synthetic built-in customizations that carry discovery and invocation metadata, but no readable file content.
 */
export const AGENT_BUILTIN_CUSTOMIZATION_SCHEME = 'agent-builtin';

/** Discovery records whose provider has not reported readable source content. */
export const AGENT_DISCOVERY_CUSTOMIZATION_SCHEME = 'agent-discovery';

/**
 * Scheme used for the in-memory plugin filesystem backing synced customizations.
 *
 * URIs under this scheme are served by a registered in-memory filesystem provider
 * and are reachable by the agent host via `fetchContent`.
 */
export const SYNCED_CUSTOMIZATION_SCHEME = 'vscode-synced-customization';
export const SYNCED_CUSTOMIZATION_DISPLAY_NAME = 'VS Code Synced Data';

/**
 * Checks raw host URIs and client-wrapped Agent Host URIs for the built-in customization scheme.
 */
export function isAgentBuiltinCustomizationUri(resource: URI): boolean {
	return fromAgentHostUri(resource).scheme === AGENT_BUILTIN_CUSTOMIZATION_SCHEME;
}

export function hasReadableCustomizationContent(resource: URI): boolean {
	const scheme = fromAgentHostUri(resource).scheme;
	return scheme !== AGENT_BUILTIN_CUSTOMIZATION_SCHEME && scheme !== AGENT_DISCOVERY_CUSTOMIZATION_SCHEME && scheme !== 'claude-internal';
}

/**
 * The URI a host publishes for a skill served by an MCP server: readable through the server's
 * channel when one is available, otherwise explicitly discovery-only. Clients use published URIs
 * as they are, so peers that publish their own readable URIs keep them.
 */
export function getMcpSkillCustomizationUri(skillUri: string, channel: string | undefined, name: string): string {
	return channel ? buildMcpResourceUri(channel, skillUri, name) : URI.parse(skillUri).with({ scheme: AGENT_DISCOVERY_CUSTOMIZATION_SCHEME }).toString();
}

/**
 * The published name of a skill served by an MCP server, `<server>:<skill>`. Whitespace is replaced
 * so that the name stays a single `/name` token in chat input.
 */
export function getMcpSkillName(serverName: string, skillName: string): string {
	return `${getMcpSkillNamePrefix(serverName)}${skillName.replace(/\s+/g, '-')}`;
}

/** The prefix that {@link getMcpSkillName} adds for a server. */
export function getMcpSkillNamePrefix(serverName: string): string {
	return `${serverName.replace(/\s+/g, '-')}:`;
}
