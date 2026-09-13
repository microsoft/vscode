/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { readAgentHostLocalCanvasWorkspace } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { localCanvasPocWorkspaceMessage } from '../../../../../platform/agentHost/common/localCanvasPoc.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution } from '../../../../../workbench/common/contributions.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { IChatEntitlementService } from '../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { INewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { NewSessionNavigationGuard } from '../../../chat/browser/newSessionNavigationGuard.js';

export class LocalCanvasPocWorkspaceContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.localCanvasPocWorkspace';
	static readonly openCommandId = 'workbench.action.sessions.canvas.openDemoWorkspace';
	private readonly _recovery = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IAgentHostService private readonly agentHostService: IAgentHostService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@INewSessionComposerService private readonly composerService: INewSessionComposerService,
		@IChatInputNotificationService inputNotifications: IChatInputNotificationService,
		@INotificationService private readonly notificationService: INotificationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		if (isWeb || environmentService.isBuilt || environmentService.remoteAuthority) {
			return;
		}
		this._register(CommandsRegistry.registerCommand(LocalCanvasPocWorkspaceContribution.openCommandId, (_, sessionId: string) => this.openDemoWorkspace(sessionId)));
		this._register(toDisposable(() => inputNotifications.deleteNotification(LocalCanvasPocWorkspaceContribution.ID)));
		this._register(autorun(reader => {
			const hidden = entitlementService.sentimentObs.read(reader).hidden;
			const workspace = readAgentHostLocalCanvasWorkspace(agentHostService.initializeResult.read(reader));
			const session = sessionsService.activeSession.read(reader);
			const directories = session?.workspace.read(reader)?.folders.map(folder => folder.workingDirectory);
			if (!workspace || hidden || session?.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID || session.sessionType !== 'copilotcli'
				|| (directories?.length === 1 && isEqual(directories[0], workspace))) {
				inputNotifications.deleteNotification(LocalCanvasPocWorkspaceContribution.ID);
				return;
			}
			inputNotifications.setNotification({
				id: LocalCanvasPocWorkspaceContribution.ID,
				severity: ChatInputNotificationSeverity.Warning,
				message: localize('localCanvasPoc.workspaceNotice', "This session is outside the canvas demo workspace"),
				description: localCanvasPocWorkspaceMessage(workspace, directories),
				actions: [{
					kind: ChatInputNotificationActionKind.Command,
					label: localize('localCanvasPoc.newSession', "New Session in Demo Workspace"),
					commandId: LocalCanvasPocWorkspaceContribution.openCommandId,
					commandArgs: [session.sessionId],
					keepOpen: true,
				}],
				sessionResources: [session.activeChat.read(reader).resource],
				dismissible: false,
				autoDismissOnMessage: false,
			});
		}));
	}

	private async openDemoWorkspace(sessionId: string): Promise<void> {
		const initializeResult = this.agentHostService.initializeResult.get();
		const workspace = readAgentHostLocalCanvasWorkspace(initializeResult);
		const activeSession = this.sessionsService.activeSession.get();
		if (!workspace || this.entitlementService.sentiment.hidden || activeSession?.sessionId !== sessionId || activeSession.providerId !== LOCAL_AGENT_HOST_PROVIDER_ID || activeSession.sessionType !== 'copilotcli') {
			this.notificationService.info(localize('localCanvasPoc.recoveryUnavailable', "Canvas workspace recovery is no longer available for this session."));
			return;
		}
		const pendingDraft = this.sessionsManagementService.newSession.get();
		if (pendingDraft?.status.get() === SessionStatus.Untitled && pendingDraft.sessionId !== activeSession.sessionId) {
			this.notificationService.info(localize('localCanvasPoc.pendingDraft', "Your existing new-session draft was kept. Finish or clear that draft before opening a new session in the demo workspace."));
			return;
		}
		const store = this._recovery.value = new DisposableStore();
		const guard = store.add(new NewSessionNavigationGuard(this.sessionsService.activeSession, this.composerService.activeComposer));
		store.add(autorun(reader => {
			if (this.agentHostService.initializeResult.read(reader) !== initializeResult || this.entitlementService.sentimentObs.read(reader).hidden) {
				guard.cancel();
			}
		}));
		try {
			if (guard.canNavigate) {
				const result = await this.sessionsService.openNewSession({
					folderUri: workspace,
					providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
					sessionTypeId: 'copilotcli',
					isolationMode: 'workspace',
					cancelRestore: true,
				}, guard.token);
				if (result.trustDeclined || (result.session && isEqual(result.session.workspace.get()?.folders[0]?.workingDirectory, workspace))) {
					return;
				}
			}
			if (guard.token.isCancellationRequested) {
				this.notificationService.info(localize('localCanvasPoc.preserveDraft', "Your draft or newer selection was kept. Finish or clear the new-session draft, then open the demo workspace again."));
			} else {
				throw new Error(localize('localCanvasPoc.recoveryFailed', "The demo workspace could not be opened. Check that the local Copilot provider is available and try again."));
			}
		} finally {
			if (this._recovery.value === store) {
				this._recovery.clear();
			}
		}
	}
}
