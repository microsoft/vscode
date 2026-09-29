/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { McpServerStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { IAgentHostCustomizationService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';

/** Session-scoped sign-in actions, absent when no enabled MCP server needs authentication. */
export class SessionMcpServers extends Disposable {
	readonly sections: IObservable<readonly IChatPillSection[]>;

	constructor(
		session: IObservable<IActiveSession | undefined>,
		@IAgentHostCustomizationService customizations: IAgentHostCustomizationService,
	) {
		super();

		const changed = observableSignalFromEvent(this, customizations.onDidChangeCustomizations);
		this.sections = derived(this, reader => {
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
