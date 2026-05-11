/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { McpServerStatusKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IAgentHostMcpAuthRegistry } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostMcpAuthRegistry.js';
import { showMcpAuthContextMenu } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/chatMcpAuthAction.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

/**
 * Toolbar indicator for the new-chat-input that surfaces MCP servers
 * needing authentication on the currently active session. Mirrors the
 * chat-input toolbar's {@link OpenMcpAuthAction} but renders directly
 * because the new-chat-input doesn't host `MenuId.ChatExecute`.
 *
 * Visibility tracks
 * {@link ISessionsManagementService.activeSession}: when the active
 * session has at least one MCP server in `AuthRequired` state (looked
 * up via {@link IAgentHostMcpAuthRegistry}), the indicator appears;
 * otherwise it's hidden. Clicking opens the same context menu used by
 * the chat-input action.
 */
export class NewChatMcpAuthIndicator extends Disposable {

	private readonly _button: Button;
	private readonly _container: HTMLElement;

	constructor(
		container: HTMLElement,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IAgentHostMcpAuthRegistry private readonly _registry: IAgentHostMcpAuthRegistry,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();

		this._container = dom.append(container, dom.$('.sessions-chat-mcp-auth-indicator'));
		this._container.classList.add('hidden');

		this._button = this._register(new Button(this._container, {
			secondary: true,
			title: localize('newChatMcpAuth.title', "Authenticate MCP Servers"),
			ariaLabel: localize('newChatMcpAuth.ariaLabel', "One or more MCP servers require authentication"),
		}));
		// Match the codicon used by `OpenMcpAuthAction` so users see the
		// same affordance on both surfaces.
		this._button.element.classList.add(...ThemeIcon.asClassNameArray(Codicon.mcp));

		this._register(this._button.onDidClick(() => this._onClick()));

		// Single autorun: re-evaluates when the active session changes,
		// when a registry entry is registered/unregistered for the
		// current session resource (race: the session handler often
		// registers AFTER this contribution first reads the active
		// session), or when the entry's `mcpServers` observable
		// changes.
		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			const entry = activeSession
				? this._registry.getEntry(activeSession.resource, reader)
				: undefined;
			if (!entry) {
				this._setHidden(true);
				return;
			}
			const summaries = entry.mcpServers.read(reader);
			const hasAuthRequired = summaries.some(s => s.status.kind === McpServerStatusKind.AuthRequired);
			this._setHidden(!hasAuthRequired);
		}));
	}

	private _setHidden(hidden: boolean): void {
		this._container.classList.toggle('hidden', hidden);
	}

	private _onClick(): void {
		const activeSession = this._sessionsManagementService.activeSession.get();
		const entry = activeSession ? this._registry.getEntry(activeSession.resource) : undefined;
		if (!entry) {
			return;
		}
		showMcpAuthContextMenu(entry, this._button.element, this._contextMenuService);
	}
}
