/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Prototype only, behind `chat.copilotCli.handoffPrototype`: continues the Copilot CLI sessions that `/code` hands to
 * the Agents window, and offers Continue in Terminal on its sessions.
 */

import { raceTimeout } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING } from '../../../../platform/window/common/window.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CopilotCliSessionLinkOpener } from '../../../../workbench/contrib/chat/browser/copilotCliSessionLink.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICopilotCliHandoffService } from '../../../../workbench/contrib/chat/common/copilotCliHandoff.js';
import { Menus, SessionHeaderMenus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionItemIsMultiSelectionContext, SessionProviderIdContext, SessionTypeContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { ILifecycleService, LifecyclePhase } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { resolveLinkedChat } from '../browser/chatLinkRouting.js';
import { findSessionForOpenSessionLink } from '../browser/openSessionLinkOpener.contribution.js';

/** How long a session that the agent host imported may take to appear among the sessions of the Agents window. */
const IMPORTED_SESSION_TIMEOUT_MS = 15_000;

/** Opens a Copilot CLI session that the agent host imported in the Agents window, as a link to the session does. */
class AgentsWindowImportedSessionOpener {

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ILogService private readonly _logService: ILogService,
	) { }

	/** Resolves to the chat it opened, or `undefined` when the session didn't appear. */
	async open(backendSession: URI): Promise<URI | undefined> {
		const session = await this._waitForSession(backendSession);
		if (!session) {
			this._logService.warn(`[CopilotCliHandoff] The imported session ${backendSession.toString()} didn't appear in the Agents window`);
			this._notificationService.error(localize('copilotCliHandoff.agentsSessionNotFound', "Couldn't show the Copilot CLI session in the Agents window."));
			return undefined;
		}
		const chatResource = await resolveLinkedChat(this._agentHostConnectionsService, session, undefined);
		await this._sessionsService.openChat(session, chatResource, { source: 'link' });
		return chatResource;
	}

	private async _waitForSession(backendSession: URI): Promise<ISession | undefined> {
		const store = new DisposableStore();
		try {
			return await raceTimeout(new Promise<ISession>(resolve => {
				const find = () => {
					const session = findSessionForOpenSessionLink(backendSession, this._sessionsManagementService, this._agentHostConnectionsService);
					if (session) {
						resolve(session);
					}
				};
				store.add(this._sessionsManagementService.onDidChangeSessions(find));
				store.add(this._agentHostConnectionsService.onDidChangeSessionResolution(find));
				find();
			}), IMPORTED_SESSION_TIMEOUT_MS);
		} finally {
			store.dispose();
		}
	}
}

/** Continues the Copilot CLI sessions that `/code` hands to the Agents window. */
class AgentsWindowCopilotCliSessionLinkHandler extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.copilotCliSessionLinkHandler';

	private readonly _importedSessionOpener: AgentsWindowImportedSessionOpener;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@ISessionsPartService private readonly _sessionsPartService: ISessionsPartService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._importedSessionOpener = this._instantiationService.createInstance(AgentsWindowImportedSessionOpener);
		const handleOpenCopilotCliSession = (_: unknown, ...args: unknown[]) => {
			const sessionId = args[0];
			this._logService.trace('[CopilotCliHandoff] vscode:openCopilotCliSession', sessionId);
			if (typeof sessionId === 'string') {
				this._open(sessionId).catch(error => this._logService.error('[CopilotCliHandoff] vscode:openCopilotCliSession failed', error));
			}
		};
		ipcRenderer.on('vscode:openCopilotCliSession', handleOpenCopilotCliSession);
		this._register({ dispose: () => ipcRenderer.removeListener('vscode:openCopilotCliSession', handleOpenCopilotCliSession) });
	}

	private async _open(sessionId: string): Promise<void> {
		// Opening the session cancels the restore of the last one, so let that start first.
		await this._lifecycleService.when(LifecyclePhase.Restored);
		const opener = this._instantiationService.createInstance(CopilotCliSessionLinkOpener);
		await this._sessionsPartService.getProgressIndicator().showWhile(opener.open(sessionId, {
			openImported: backendSession => this._importedSessionOpener.open(backendSession),
		}));
	}
}

/** Lets Take It Back open the sessions it imports again in the Agents window rather than in a Chat view. */
class AgentsWindowCopilotCliTakeBackContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.copilotCliTakeBack';

	constructor(
		@ICopilotCliHandoffService copilotCliHandoffService: ICopilotCliHandoffService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const opener = instantiationService.createInstance(AgentsWindowImportedSessionOpener);
		this._register(copilotCliHandoffService.setImportedSessionOpener(backendSession => opener.open(backendSession)));
	}
}

// The IPC handler must listen before the main process hands over the session that started the window.
registerWorkbenchContribution2(AgentsWindowCopilotCliSessionLinkHandler.ID, AgentsWindowCopilotCliSessionLinkHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentsWindowCopilotCliTakeBackContribution.ID, AgentsWindowCopilotCliTakeBackContribution, WorkbenchPhase.AfterRestored);

const localCopilotSessionWithHandoff = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	ContextKeyExpr.equals(`config.${COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING}`, true),
	ContextKeyExpr.equals(SessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID),
	ContextKeyExpr.equals(SessionTypeContext.key, COPILOT_CLI_AGENT_PROVIDER_ID),
	SessionIsArchivedContext.negate(),
);

registerAction2(class ContinueSessionInTerminalAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.action.copilotCli.continueInTerminal',
			title: localize2('copilotCliHandoff.continueInTerminal', "Continue in Terminal"),
			f1: false,
			precondition: SessionItemIsMultiSelectionContext.negate(),
			menu: [{
				id: Menus.SessionItemContextMenu,
				group: 'navigation',
				order: 5,
				when: localCopilotSessionWithHandoff,
			}, ...SessionHeaderMenus.map(id => ({
				id,
				// After Open in New Window.
				group: 'secondary/4_pin',
				order: 15,
				when: ContextKeyExpr.and(localCopilotSessionWithHandoff, SessionIsCreatedContext),
			}))],
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? (context.length === 1 ? context[0] : undefined) : context;
		if (session) {
			await accessor.get(ICopilotCliHandoffService).continueInTerminal(session.mainChat.get().resource);
		}
	}
});
