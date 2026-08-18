/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { localize } from '../../../../../../nls.js';
import { ChatPermissionDomainId } from '../../../common/permissions/chatPermissions.js';
import { chatPermissionDomainRegistry, IChatPermissionDomain } from './chatPermissionDomainRegistry.js';

/**
 * The permission domains VS Code can display today.
 *
 * There is deliberately one domain per rule family the runtime's DSL accepts — shell, file and
 * network. Capabilities governed by a different contract (MCP servers, built-in tools) have no
 * entry here until the runtime can report rules for them, so the UI never invites a user to
 * configure something that would not be enforced.
 */
/**
 * Documentation for how the agent asks for and records approval. Shared by every permission
 * domain, since the runtime applies one approval model across terminal, file and network access.
 */
const PERMISSIONS_DOCS_URL = 'https://code.visualstudio.com/docs/agents/run/security?referrer=in-product';

export const CHAT_PERMISSION_DOMAINS: readonly IChatPermissionDomain[] = [
	{
		id: ChatPermissionDomainId.Terminal,
		label: localize('chatPermissions.terminal', "Terminal"),
		icon: Codicon.terminal,
		description: localize('chatPermissions.terminalDescription', "Controls which terminal commands the agent may run, and which need your approval first."),
		filterAriaLabel: localize('chatPermissions.terminalFilter', "Search terminal rules"),
		learnMoreLabel: localize('chatPermissions.learnMoreTerminal', "Learn more about agent permissions"),
		learnMoreUrl: PERMISSIONS_DOCS_URL,
	},
	{
		id: ChatPermissionDomainId.Files,
		label: localize('chatPermissions.files', "Files"),
		icon: Codicon.file,
		description: localize('chatPermissions.filesDescription', "Controls which files the agent may read and change. Patterns are anchored to the workspace, your home directory, the working directory, or the filesystem root."),
		filterAriaLabel: localize('chatPermissions.filesFilter', "Search file rules"),
		learnMoreLabel: localize('chatPermissions.learnMoreFiles', "Learn more about agent permissions"),
		learnMoreUrl: PERMISSIONS_DOCS_URL,
	},
	{
		id: ChatPermissionDomainId.Network,
		label: localize('chatPermissions.network', "Network"),
		icon: Codicon.globe,
		description: localize('chatPermissions.networkDescription', "Controls which domains the agent may request."),
		filterAriaLabel: localize('chatPermissions.networkFilter', "Search network rules"),
		learnMoreLabel: localize('chatPermissions.learnMoreNetwork', "Learn more about agent permissions"),
		learnMoreUrl: PERMISSIONS_DOCS_URL,
	},
];

for (const domain of CHAT_PERMISSION_DOMAINS) {
	chatPermissionDomainRegistry.register(domain);
}
