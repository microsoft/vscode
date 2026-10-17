/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { COPILOT_CLI_AGENT_PROVIDER_ID } from '../../../../platform/agentHost/common/agent.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostEnablementService } from '../../../../platform/agentHost/common/agentHostEnablementService.js';
import { AgentSession, IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { supportsAgentHostSessionImport } from '../../../../platform/agentHost/common/meta/agentHostSessionImportMeta.js';
import type { InitializeResult } from '../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { AhpErrorCodes, ProtocolError } from '../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IManagedSettingsService, requiresCopilotAgentHost } from '../../../../platform/policy/common/copilotManagedSettings.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { isValidCopilotCliSessionId } from '../../../../platform/window/common/window.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService, SessionType } from '../common/chatSessionsService.js';
import { getComputedDefaultSessionType } from '../common/constants.js';
import { ChatViewPaneTarget, IChatWidgetService } from './chat.js';
import { COPILOT_CLI_EH_SCHEME } from './copilotCliEventsUri.js';

/** How long a link opened at startup waits for the agent host to finish its handshake. */
const AGENT_HOST_READY_TIMEOUT_MS = 30_000;

/**
 * Opens Copilot CLI sessions, identified by their CLI session id, in the Chat view.
 *
 * Used for product protocol links with a `copilotCliSession` query parameter,
 * such as the link that the Copilot CLI's `/code` command opens.
 *
 * When new chats default to the Copilot harness, or the Copilot CLI chat session
 * provider isn't available, the agent host imports the session, so the chat
 * continues in the same runtime with the model and modes the CLI left it in.
 * Otherwise, or when the harness can't import the session, the session opens
 * through the Copilot CLI chat session provider, which loads its history from
 * the CLI's session state on disk. When neither can open it, the user is told
 * so instead of being shown a new, empty chat.
 */
export class CopilotCliSessionLinkOpener {

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IManagedSettingsService private readonly managedSettingsService: IManagedSettingsService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IProgressService private readonly progressService: IProgressService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async open(sessionId: string): Promise<void> {
		if (!isValidCopilotCliSessionId(sessionId)) {
			this.logService.warn('[CopilotCliSessionLinkOpener] Ignoring a link with an invalid Copilot CLI session id');
			return;
		}

		if (this.chatEntitlementService.sentiment.hidden) {
			this.reportUnavailable(sessionId);
			return;
		}

		const legacyAvailable = await this.chatSessionsService.canResolveChatSession(COPILOT_CLI_EH_SCHEME);
		if (await this.shouldUseCopilotHarness(legacyAvailable)) {
			const opened = await this.progressService.withProgress(
				{ location: ProgressLocation.Window, title: localize('copilotCliSessionOpening', "Opening Copilot CLI session…") },
				() => this.openInCopilotHarness(sessionId, legacyAvailable),
			);
			if (opened) {
				return;
			}
		}

		if (!legacyAvailable) {
			this.reportUnavailable(sessionId);
			return;
		}

		await this.chatWidgetService.openSession(URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${sessionId}` }), ChatViewPaneTarget);
	}

	/**
	 * Whether the Copilot harness opens the session: it does when new chats default
	 * to it, and when the Copilot CLI chat session provider isn't available.
	 */
	private async shouldUseCopilotHarness(legacyAvailable: boolean): Promise<boolean> {
		if (!this.agentHostEnablementService.enabled.get() || !await this.chatSessionsService.canResolveChatSession(SessionType.AgentHostCopilot)) {
			return false;
		}
		if (!legacyAvailable) {
			return true;
		}
		const defaultSessionType = getComputedDefaultSessionType(
			this.configurationService,
			this.chatSessionsService,
			this.workspaceContextService.getWorkspace(),
			true,
			this.agentHostEnablementService.managedSandboxEnforced.get(),
			requiresCopilotAgentHost(this.managedSettingsService, this.configurationService),
		);
		return defaultSessionType === SessionType.AgentHostCopilot;
	}

	/**
	 * Imports the session into the agent host and opens it in the Chat view.
	 * Returns false when the Copilot CLI chat session provider should open it instead.
	 */
	private async openInCopilotHarness(sessionId: string, legacyAvailable: boolean): Promise<boolean> {
		const connection = this.agentHostConnectionsService.ambientConnection;
		if (!connection.importSession || !await this.isImportSupported(connection)) {
			this.logService.warn(`[CopilotCliSessionLinkOpener] The agent host can't import sessions, opening session ${sessionId} through the Copilot CLI provider`);
			return false;
		}
		const backendSession = AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER_ID, sessionId);
		try {
			await connection.importSession(backendSession);
		} catch (error) {
			// A session the harness can't take over, for example one created by another client, still opens through the provider.
			if (legacyAvailable && error instanceof ProtocolError && error.code === AhpErrorCodes.SessionNotFound) {
				this.logService.info(`[CopilotCliSessionLinkOpener] The agent host can't import session ${sessionId}, opening it through the Copilot CLI provider`);
				return false;
			}
			this.logService.error(`[CopilotCliSessionLinkOpener] Failed to import session ${sessionId}`, error);
			this.notificationService.error(localize('copilotCliSessionImportFailed', "Couldn't open the Copilot CLI session: {0}", toErrorMessage(error)));
			return true;
		}
		await this.chatWidgetService.openSession(this.agentHostConnectionsService.registerSessionResource(backendSession, undefined, COPILOT_CLI_AGENT_PROVIDER_ID), ChatViewPaneTarget);
		return true;
	}

	/** Whether the connection's handshake advertises session import, waiting for a host that is still starting. */
	private async isImportSupported(connection: IAgentConnection): Promise<boolean> {
		const store = new DisposableStore();
		try {
			const initializeResult = await raceTimeout(new Promise<InitializeResult>(resolve => {
				store.add(autorun(reader => {
					const result = connection.initializeResult.read(reader);
					if (result) {
						resolve(result);
					}
				}));
			}), AGENT_HOST_READY_TIMEOUT_MS);
			return supportsAgentHostSessionImport(initializeResult);
		} finally {
			store.dispose();
		}
	}

	private reportUnavailable(sessionId: string): void {
		this.logService.warn(`[CopilotCliSessionLinkOpener] Copilot CLI sessions are not available, cannot open session ${sessionId}`);
		this.notificationService.error(localize('copilotCliSessionUnavailable', "Couldn't open the Copilot CLI session because Copilot CLI sessions aren't available. Make sure the GitHub Copilot Chat extension is enabled."));
	}
}
