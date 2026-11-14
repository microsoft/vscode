/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionConfig } from '@github/copilot-sdk';

type UserInputRequest = Parameters<NonNullable<SessionConfig['onUserInputRequest']>>[0];

export interface ICopilotMcpSkillConsentRequest {
	readonly action: 'load' | 'execute' | 'cross-origin-read';
	readonly servers: string[];
	readonly approveChoice: 'Allow once';
	readonly declineChoice: 'Decline';
}

/** Parses the runtime's untyped mcp_consent.rs prompt until it exposes structured consent fields. */
export function parseCopilotMcpSkillConsentRequest(request: UserInputRequest): ICopilotMcpSkillConsentRequest | undefined {
	if (!request.choices?.includes('Allow once') || !request.choices.includes('Decline')) {
		return undefined;
	}
	const match = /^Allow this MCP skill (?<action>load|execute|cross-origin-read) operation\?\n\n(?<origins>[\s\S]+?)\n\nOperation:\n[\s\S]+$/.exec(request.question);
	const action = match?.groups?.action;
	const origins = match?.groups?.origins;
	if (!origins || (action !== 'load' && action !== 'execute' && action !== 'cross-origin-read')) {
		return undefined;
	}
	const servers = new Set<string>();
	for (const origin of origins.split('\n\n')) {
		const server = /^Server: (?<name>[^\r\n]+) \([^\r\n]+\)\nSkill: [^\r\n]+\nManifest: [^\r\n]+$/.exec(origin)?.groups?.name;
		if (!server) {
			return undefined;
		}
		servers.add(server);
	}
	return { action, servers: [...servers], approveChoice: 'Allow once', declineChoice: 'Decline' };
}
