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
export const CHAT_PERMISSION_DOMAINS: readonly IChatPermissionDomain[] = [
	{
		id: ChatPermissionDomainId.Terminal,
		label: localize('chatPermissions.terminal', "Terminal"),
		icon: Codicon.terminal,
		description: localize('chatPermissions.terminalDescription', "Controls which terminal commands the agent may run, and which need your approval first."),
		filterPlaceholder: localize('chatPermissions.terminalFilter', "Filter terminal rules"),
	},
	{
		id: ChatPermissionDomainId.Files,
		label: localize('chatPermissions.files', "Files"),
		icon: Codicon.file,
		description: localize('chatPermissions.filesDescription', "Controls which files the agent may read and change. Patterns are anchored to the workspace, your home directory, the working directory, or the filesystem root."),
		filterPlaceholder: localize('chatPermissions.filesFilter', "Filter file rules"),
	},
	{
		id: ChatPermissionDomainId.Network,
		label: localize('chatPermissions.network', "Network"),
		icon: Codicon.globe,
		description: localize('chatPermissions.networkDescription', "Controls which domains the agent may request."),
		filterPlaceholder: localize('chatPermissions.networkFilter', "Filter network rules"),
	},
];

for (const domain of CHAT_PERMISSION_DOMAINS) {
	chatPermissionDomainRegistry.register(domain);
}
