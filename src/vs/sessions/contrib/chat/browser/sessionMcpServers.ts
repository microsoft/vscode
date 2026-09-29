/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { McpServerStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

export const SESSION_MCP_AUTH_PILL_SETTING = 'chat.agentSessions.mcpAuthPill.enabled';

/** Session-scoped sign-in actions, absent when no enabled MCP server needs authentication. */
export class SessionMcpServers extends Disposable {
	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		@IAgentHostCustomizationService customizations: IAgentHostCustomizationService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		const changed = observableSignalFromEvent(this, customizations.onDidChangeCustomizations);
		const enabled = observableFromEvent(this, configurationService.onDidChangeConfiguration,
			() => configurationService.getValue<boolean>(SESSION_MCP_AUTH_PILL_SETTING) === true);
		this.sections = derived(this, reader => {
			if (!enabled.read(reader)) {
				return [];
			}
			const resource = session.read(reader)?.resource;
			if (!resource) {
				return [];
			}
			changed.read(reader);
			const entries = customizations.getMcpServers(resource)
				.filter(server => server.enabled && server.status === McpServerStatus.AuthRequired)
				.map(server => ({
					id: server.id,
					label: localize('sessionMcpServers.signIn', "Sign In to {0}", server.name),
					icon: Codicon.mcp,
					ariaDescription: localize('sessionMcpServers.authRequired', "MCP server requires authentication"),
					open: async () => { await customizations.authenticateMcpServer(resource, server.id); },
				}));
			return entries.length ? [{ title: localize('sessionMcpServers.title', "MCP Servers Requiring Sign-In"), entries }] : [];
		});
	}
}
