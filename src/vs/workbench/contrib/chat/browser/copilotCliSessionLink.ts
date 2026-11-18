/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import Severity from '../../../../base/common/severity.js';
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
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING, isValidCopilotCliSessionId } from '../../../../platform/window/common/window.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { IChatSessionsService, SessionType } from '../common/chatSessionsService.js';
import { ICopilotCliHandoffService } from '../common/copilotCliHandoff.js';
import { ChatViewPaneTarget, IChatWidgetService } from './chat.js';

/** How long a link opened at startup waits for the agent host to finish its handshake. */
const AGENT_HOST_READY_TIMEOUT_MS = 30_000;

export interface ICopilotCliSessionOpenOptions {
	/** The session is taken back from the Copilot CLI, which records the move itself, rather than handed off with `/code`. */
	readonly takeBack?: boolean;
	/**
	 * Opens the imported session, by its backend session, where this window shows sessions, such as the Agents window,
	 * instead of in the Chat view. Resolves to the chat session resource it opened, or `undefined` when it couldn't.
	 */
	readonly openImported?: (backendSession: URI) => Promise<URI | undefined>;
}

/**
 * Opens Copilot CLI sessions, identified by their CLI session id, in the Chat view.
 *
 * Used for product protocol links with a `copilotCliSession` query parameter,
 * such as the link that the Copilot CLI's `/code` command opens. The agent host
 * imports the session, so the chat continues in the same runtime with the model,
 * agent and modes the CLI left it in. When the agent host can't open it, the
 * user is told so instead of being shown a new, empty chat.
 */
export class CopilotCliSessionLinkOpener {

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@IAgentHostConnectionsService private readonly agentHostConnectionsService: IAgentHostConnectionsService,
		@IAgentHostEnablementService private readonly agentHostEnablementService: IAgentHostEnablementService,
		@IProgressService private readonly progressService: IProgressService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
		@ICopilotCliHandoffService private readonly copilotCliHandoffService: ICopilotCliHandoffService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	/** Resolves to the chat session resource that opened, or `undefined` when the session didn't open. */
	async open(sessionId: string, options?: ICopilotCliSessionOpenOptions): Promise<URI | undefined> {
		if (!isValidCopilotCliSessionId(sessionId)) {
			this.logService.warn('[CopilotCliSessionLinkOpener] Ignoring a link with an invalid Copilot CLI session id');
			return undefined;
		}

		if (this.chatEntitlementService.sentiment.hidden || !this.agentHostEnablementService.enabled.get() || !await this.chatSessionsService.canResolveChatSession(SessionType.AgentHostCopilot)) {
			this.logService.warn(`[CopilotCliSessionLinkOpener] Copilot agent host sessions are not available, cannot open session ${sessionId}`);
			this.notificationService.error(localize('copilotCliSessionUnavailable', "Couldn't open the Copilot CLI session because Copilot agent sessions aren't available in this window."));
			return undefined;
		}
		if (this.configurationService.getValue<boolean>(COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING) === true && !await this.copilotCliHandoffService.prepareToOpenFromCli(sessionId)) {
			return undefined;
		}

		const resource = await this.progressService.withProgress(
			{ location: ProgressLocation.Window, title: localize('copilotCliSessionOpening', "Opening Copilot CLI session…") },
			() => this.openInAgentHost(sessionId, options?.openImported),
		);
		if (resource && !options?.takeBack) {
			await this.copilotCliHandoffService.didContinueFromCli(sessionId, resource);
		}
		return resource;
	}

	/** Imports the session into the agent host and opens it in the Chat view, or with `openImported`. */
	private async openInAgentHost(sessionId: string, openImported?: (backendSession: URI) => Promise<URI | undefined>): Promise<URI | undefined> {
		const connection = this.agentHostConnectionsService.ambientConnection;
		if (!connection.importSession || !await this.isImportSupported(connection)) {
			this.logService.warn(`[CopilotCliSessionLinkOpener] The agent host can't import sessions, cannot open session ${sessionId}`);
			this.notificationService.error(localize('copilotCliSessionImportUnsupported', "Couldn't open the Copilot CLI session because the Copilot agent host can't import sessions."));
			return undefined;
		}
		// The Copilot backing of the session; the host admits it under its own address, which it reports.
		const backing = AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER_ID, sessionId);
		// Prototype: a session handed over is shown whatever the external sessions filter says.
		const reveal = this.configurationService.getValue<unknown>(COPILOT_CLI_HANDOFF_PROTOTYPE_SETTING) === true;
		let imported: URI | void;
		try {
			try {
				imported = await connection.importSession(backing, reveal ? { reveal } : undefined);
			} catch (error) {
				// Like the CLI, let the user take over a session another process holds: the record of that is best
				// effort, and one left behind by a process that exited abnormally would otherwise block the session.
				if (!(error instanceof ProtocolError && error.code === AhpErrorCodes.Conflict)) {
					throw error;
				}
				if (reveal) {
					this.notificationService.warn(localize('copilotCliSessionBusy', "This session is still open or running in its current app. Wait for its work to finish and hand it over there. It was not taken over."));
					return undefined;
				}
				if (!await this.confirmTakeOver()) {
					return undefined;
				}
				imported = await connection.importSession(backing, { takeOver: true, ...(reveal ? { reveal } : {}) });
			}
		} catch (error) {
			this.logService.error(`[CopilotCliSessionLinkOpener] Failed to import session ${sessionId}`, error);
			// The host's reason for not finding a session is internal, such as an eligibility check, so isn't shown.
			this.notificationService.error(error instanceof ProtocolError && error.code === AhpErrorCodes.SessionNotFound
				? localize('copilotCliSessionNotFound', "Couldn't open the Copilot CLI session because it couldn't be found. It may have been deleted, or it was created by another app.")
				: localize('copilotCliSessionImportFailed', "Couldn't open the Copilot CLI session: {0}", toErrorMessage(error)));
			return undefined;
		}
		// A host that doesn't report the address keeps the session at the address it was imported from.
		const session = imported ?? backing;
		if (openImported) {
			return openImported(session);
		}
		const resource = this.agentHostConnectionsService.findSessionResource(session)
			?? this.agentHostConnectionsService.registerSessionResource(session, undefined, COPILOT_CLI_AGENT_PROVIDER_ID);
		await this.chatWidgetService.openSession(resource, ChatViewPaneTarget);
		return resource;
	}

	private async confirmTakeOver(): Promise<boolean> {
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: localize('copilotCliSessionInUse', "This Copilot CLI session is open in another process"),
			detail: localize('copilotCliSessionInUseDetail', "If the Copilot CLI is still running this session, exit it there first, or both will write to the same session. Open it here anyway if that process has exited or stopped responding."),
			primaryButton: localize({ key: 'copilotCliSessionOpenAnyway', comment: ['&& denotes a mnemonic'] }, "&&Open Anyway"),
		});
		return confirmed;
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
}
