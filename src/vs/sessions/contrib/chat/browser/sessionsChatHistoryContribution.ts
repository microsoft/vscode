/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatWidget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatAgentLocation } from '../../../../workbench/contrib/chat/common/constants.js';
import { IChatWidgetHistoryService } from '../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISession } from '../../../services/sessions/common/session.js';

export const AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING = 'chat.agentSessions.scopedInputHistory';

export class SessionsChatHistoryContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.chatHistory';

	private readonly _registeredWidgets = new Set<IChatWidget>();
	private readonly _widgetDisposables = this._register(new DisposableStore());

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatWidgetHistoryService private readonly chatWidgetHistoryService: IChatWidgetHistoryService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		for (const widget of this.chatWidgetService.getAllWidgets()) {
			this._registerWidget(widget);
		}

		this._register(this.chatWidgetService.onDidAddWidget(widget => this._registerWidget(widget)));
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this._applyHistoryKeys()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
				this._applyHistoryKeys();
			}
		}));

		this._register(this.sessionsManagementService.onDidReplaceSession(e => {
			this.chatWidgetHistoryService.moveHistory(ChatAgentLocation.Chat, e.from.sessionId, e.to.sessionId);
			this._applyHistoryKeys();
		}));

		this._register(autorun(reader => {
			this.sessionsManagementService.activeSession.read(reader)?.activeChat.read(reader);
			this._applyHistoryKeys();
		}));
	}

	private _registerWidget(widget: IChatWidget): void {
		if (this._registeredWidgets.has(widget)) {
			return;
		}

		this._registeredWidgets.add(widget);
		this._widgetDisposables.add(widget.onDidChangeViewModel(() => this._applyHistoryKey(widget)));
		this._applyHistoryKey(widget);
	}

	private _applyHistoryKeys(): void {
		for (const widget of this.chatWidgetService.getAllWidgets()) {
			this._applyHistoryKey(widget);
		}
	}

	private _applyHistoryKey(widget: IChatWidget): void {
		const sessionResource = widget.viewModel?.sessionResource;
		widget.inputPart.setHistoryKey(this._useScopedInputHistory() && sessionResource ? this._getHistoryKey(sessionResource) : undefined);
	}

	private _useScopedInputHistory(): boolean {
		return this.configurationService.getValue<boolean>(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
	}

	private _getHistoryKey(sessionResource: URI): string | undefined {
		const activeSession = this.sessionsManagementService.activeSession.get();
		if (activeSession && this._matchesSession(activeSession, sessionResource)) {
			return activeSession.sessionId;
		}

		for (const session of this.sessionsManagementService.getSessions()) {
			if (this._matchesSession(session, sessionResource)) {
				return session.sessionId;
			}
		}

		return undefined;
	}

	private _matchesSession(session: ISession, sessionResource: URI): boolean {
		if (this.uriIdentityService.extUri.isEqual(session.resource, sessionResource)) {
			return true;
		}

		return session.chats.get().some(chat => this.uriIdentityService.extUri.isEqual(chat.resource, sessionResource));
	}
}