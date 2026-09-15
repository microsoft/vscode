/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toAction } from '../../../../base/common/actions.js';
import { isEqual } from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { LOCAL_AGENT_HOST_SCHEME_PREFIX } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize, localize2 } from '../../../../nls.js';
import { IsAuxiliaryWindowContext } from '../../../../workbench/common/contextkeys.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IIssueWizardBootstrapRequest, IIssueWizardCreateSessionOptions, IIssueWizardLaunchOptions, IIssueWizardLaunchSession, IIssueWizardLaunchTarget, IIssueWizardLauncherService } from '../../../../workbench/contrib/issue/browser/issueWizard.js';
import { Menus } from '../../../browser/menus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../common/agentHostSessionsProvider.js';
import { IsPhoneLayoutContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ChatModelSource, ISession } from '../../../services/sessions/common/session.js';

export const ISSUE_WIZARD_AGENTS_COMMAND_ID = 'sessions.action.issueWizard';

interface IIssueWizardLaunchContext {
	readonly investigationId: string;
	readonly folderUri: URI | undefined;
}

let issueWizardInvestigationCounter = 0;

/** Creates and bootstraps an Issue Wizard session inside the Agents Window. */
class SessionsIssueWizardLaunchTarget implements IIssueWizardLaunchTarget {

	constructor(
		private readonly sessionsService: ISessionsService,
		private readonly sessionsManagementService: ISessionsManagementService,
		private readonly sessionsProvidersService: ISessionsProvidersService,
		private readonly chatWidgetService: IChatWidgetService,
		private readonly notificationService: INotificationService,
	) { }

	async createSession(options: IIssueWizardCreateSessionOptions): Promise<IIssueWizardLaunchSession | undefined> {
		if (!options.sessionType.startsWith(LOCAL_AGENT_HOST_SCHEME_PREFIX)) {
			throw new Error(localize('sessions.issueWizard.unsupportedSessionType', "Issue Wizard cannot start with session type '{0}'.", options.sessionType));
		}

		const launchContext: IIssueWizardLaunchContext = {
			investigationId: `sessions.issueWizard.investigation.${++issueWizardInvestigationCounter}`,
			folderUri: this.sessionsService.activeSession.get()?.workspace.get()?.folders.at(0)?.root,
		};
		return this.createSessionForContext(options, launchContext);
	}

	private async createSessionForContext(options: IIssueWizardCreateSessionOptions, launchContext: IIssueWizardLaunchContext): Promise<IIssueWizardLaunchSession | undefined> {

		const createOptions = {
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionTypeId: options.sessionType.slice(LOCAL_AGENT_HOST_SCHEME_PREFIX.length),
		};
		let createdSession: ISession | undefined;
		const session = launchContext.folderUri
			? (await this.sessionsService.openNewSession({
				...createOptions,
				folderUri: launchContext.folderUri,
				cancelRestore: true,
				onSessionCreated: session => createdSession = session,
			})).session
			: this.sessionsService.openQuickChat(createOptions);
		if (!session || !this.matchesLaunchContext(session, launchContext, createdSession)) {
			return undefined;
		}
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider) {
			throw new Error(localize('sessions.issueWizard.providerUnavailable', "Issue Wizard could not access the session provider."));
		}
		provider.setModel(session.sessionId, session.mainChat.get().resource, options.modelId, ChatModelSource.Chosen);

		const send = async (request: IIssueWizardBootstrapRequest): Promise<void> => {
			try {
				await this.sessionsManagementService.sendNewChatRequest(session, {
					query: request.query,
					attachedContext: [...request.attachedContext],
					title: options.displayName,
				});
			} catch {
				this.showSendRecovery(options, request, launchContext);
			}
		};

		return {
			sessionResource: session.resource,
			send,
			getScreenshotTarget: () => {
				const activeSession = this.sessionsService.activeSession.get();
				if (!activeSession || !isEqual(activeSession.resource, session.resource)) {
					return undefined;
				}
				const sessionResource = activeSession.activeChat.get().resource;
				const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
				return widget ? { widget, sessionResource } : undefined;
			},
			revealScreenshotTarget: async target => {
				const chatResource = target.widget.viewModel?.sessionResource ?? target.sessionResource;
				await this.sessionsService.openChat(session, chatResource);
				return this.chatWidgetService.getWidgetBySessionResource(chatResource) ?? target.widget;
			},
		};
	}

	private matchesLaunchContext(session: ISession, launchContext: IIssueWizardLaunchContext, createdSession: ISession | undefined): boolean {
		const sessionFolder = session.workspace.get()?.folders.at(0)?.root;
		if (launchContext.folderUri) {
			return !!createdSession
				&& isEqual(session.resource, createdSession.resource)
				&& !!sessionFolder
				&& isEqual(sessionFolder, launchContext.folderUri);
		}
		return !sessionFolder;
	}

	private showSendRecovery(options: IIssueWizardCreateSessionOptions, request: IIssueWizardBootstrapRequest, launchContext: IIssueWizardLaunchContext): void {
		const notificationHandleRef: { current: { close(): void } | undefined } = { current: undefined };
		notificationHandleRef.current = this.notificationService.notify({
			id: launchContext.investigationId,
			severity: Severity.Error,
			message: localize('sessions.issueWizard.sendFailed', "Issue Wizard could not send its first request. Retry when ready."),
			actions: {
				primary: [toAction({
					id: `${launchContext.investigationId}.retry`,
					label: localize('sessions.issueWizard.retry', "Retry"),
					run: async () => {
						notificationHandleRef.current?.close();
						await this.retryInFreshSession(options, request, launchContext);
					},
				})],
			},
			sticky: true,
		});
	}

	private async retryInFreshSession(options: IIssueWizardCreateSessionOptions, request: IIssueWizardBootstrapRequest, launchContext: IIssueWizardLaunchContext): Promise<void> {
		try {
			const session = await this.createSessionForContext(options, launchContext);
			if (session) {
				await session.send(request);
				return;
			}
		} catch {
			// Keep the original bootstrap request recoverable below.
		}
		this.showSendRecovery(options, request, launchContext);
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: ISSUE_WIZARD_AGENTS_COMMAND_ID,
			title: localize2('sessions.issueWizard.title', "Issue Wizard"),
			tooltip: localize('sessions.issueWizard.tooltip', "Start Issue Wizard to troubleshoot a VS Code problem"),
			icon: Codicon.bug,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: Menus.TitleBarRightLayout,
				group: 'navigation',
				order: 99,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, IsAuxiliaryWindowContext.toNegated(), IsPhoneLayoutContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor, options?: IIssueWizardLaunchOptions): Promise<void> {
		const launcher = accessor.get(IIssueWizardLauncherService);
		const target = new SessionsIssueWizardLaunchTarget(
			accessor.get(ISessionsService),
			accessor.get(ISessionsManagementService),
			accessor.get(ISessionsProvidersService),
			accessor.get(IChatWidgetService),
			accessor.get(INotificationService),
		);
		await launcher.launchInTarget(target, options);
	}
});
