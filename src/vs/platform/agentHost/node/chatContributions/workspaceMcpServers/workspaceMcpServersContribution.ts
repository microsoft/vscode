/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IDispatchedAction } from '../../../common/agentHostChatContributionsService.js';
import { readSessionWorkspaceMcpServers, withSessionWorkspaceMcpServers, type ISessionWorkspaceMcpServers } from '../../../common/meta/agentHostWorkspaceMcpServersMeta.js';
import { readMcpServerSource } from '../../../common/meta/mcpCustomizationMeta.js';
import { CustomizationType, type Customization } from '../../../common/state/protocol/channels-session/state.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import type { URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { IAgentHostCustomizationEnablementService } from '../../agentHostCustomizationEnablementService.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/**
 * Publishes the host's decision for the class of MCP servers a session's
 * workspace configures (`session > workspace > chat.mcp.workspaceServersEnabled`)
 * in the session's `_meta`, so clients can offer Workspace and Session overrides
 * of the setting; see `vscode/setWorkspaceMcpServersEnablement`.
 */
export class WorkspaceMcpServersContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'workspaceMcpServers';
	readonly order = 180;

	constructor(
		_context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostCustomizationEnablementService private readonly _enablementService: IAgentHostCustomizationEnablementService,
	) {
		super();
		// The decision changes when a session's enablement cache or working directory settles,
		// when a Workspace or Session decision is written, and when the mirrored setting flips.
		this._register(_enablementService.onDidChange(event => {
			for (const session of event.sessions) {
				this._publish(session);
			}
		}));
	}

	onDidDispatchAction(dispatched: IDispatchedAction): void {
		// The customizations carry the servers this decision gates, and session creation
		// publishes them only after the state exists, whereas the provider settles the
		// enablement cache while still resolving them, before the change event can land.
		if (dispatched.rejectionReason === undefined && dispatched.action.type === ActionType.SessionCustomizationsChanged) {
			this._publish(dispatched.session);
		}
	}

	onDidRestoreSession(session: ProtocolURI): void {
		this._publish(session);
	}

	private _publish(session: ProtocolURI): void {
		const state = this._stateManager.getSessionState(session);
		if (!state) {
			return;
		}
		// Only a session whose workspace configures a server has anything to decide; every
		// `_meta` write costs a catalog synchronization, so the others are left untouched.
		const resolution = hasWorkspaceConfiguredMcpServer(state.customizations) ? this._enablementService.resolveWorkspaceMcpServers(session) : undefined;
		const next: ISessionWorkspaceMcpServers | undefined = resolution?.kind === 'resolved'
			? { enablement: resolution.enablement, enabled: resolution.enabled }
			: undefined;
		if (equals(readSessionWorkspaceMcpServers(state._meta), next)) {
			return;
		}
		this._stateManager.setSessionMeta(session, withSessionWorkspaceMcpServers(state._meta, next));
	}
}

/** A plugin's server is governed by its plugin, so only top-level workspace-sourced servers count; see `targetForMcpServer`. */
function hasWorkspaceConfiguredMcpServer(customizations: readonly Customization[] | undefined): boolean {
	return customizations?.some(customization => customization.type === CustomizationType.McpServer && readMcpServerSource(customization) === 'workspace') ?? false;
}
