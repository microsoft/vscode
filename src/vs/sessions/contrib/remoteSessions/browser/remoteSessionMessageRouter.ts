/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError, RunOnceScheduler, SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { getGlobalConfigurationValue } from '../../../../platform/agentHost/common/agentHostConfigurationSync.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { resolveAgentHostSessionTrustFolders } from '../../../../platform/agentHost/common/agentHostWorkspaceTrust.js';
import { AgentHostAgentOrchestrationLimitsSettingId } from '../../../../platform/agentHost/common/agentService.js';
import { toRemoteSessionMessageMetadata } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { buildOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { maxSentMessages, orchestrationLimitWindowMs, SessionActionLimiter } from '../../../../platform/agentHost/common/sessionActionLimiter.js';
import { ChatInteractivity as ProtocolChatInteractivity } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { DEFAULT_CHAT_ID, effectiveChatInteractivity, getSessionChatResource, isSessionStatusArchived, MessageKind, PendingMessageKind, readSessionWorkspaceless, SessionState, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { isAgentHostProvider } from '../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IRemoteSessionChat, readRemoteSessionState, resolveRemoteSessionChat, resolveRemoteSessionReference, resolveRemoteSessionSource } from './remoteSessionSource.js';
import { IRemoteSessionChatReference, IRemoteSessionChatService } from './remoteSessionChatService.js';
import { areRemoteSessionToolsEnabled } from '../common/remoteSessions.js';

const remoteMessageRetryWindowMs = orchestrationLimitWindowMs;
export const maxRemoteMessageLength = 64 * 1024;

class RemoteMessageLimitError extends Error { }

export interface ISendRemoteMessageOptions {
	readonly session: string;
	readonly message: string;
}

export interface IRemoteMessageTarget {
	readonly session: string;
	readonly chat: string;
	readonly openLink: string;
	readonly host: { readonly id: string; readonly label: string };
}

export interface ISendRemoteMessageResult extends IRemoteMessageTarget {
	readonly status: 'sent' | 'queued';
}

interface IResolvedRemoteChat extends Omit<IRemoteSessionChat, 'chat'> {
	readonly chat: URI;
	readonly hostLabel: string;
}

interface IResolvedRemoteSource extends IResolvedRemoteChat {
	/** The source chat's recorded resource. */
	readonly sourceChat: string;
}

export function parseSendRemoteMessageOptions(value: unknown): ISendRemoteMessageOptions {
	const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
	if (!input || typeof input.session !== 'string' || !input.session.trim()
		|| typeof input.message !== 'string' || !input.message.trim()
		|| input.message.length > maxRemoteMessageLength
		|| Object.keys(input).some(key => key !== 'session' && key !== 'message')) {
		throw new Error(localize('remoteMessage.invalidInput', "Provide a session reference and a non-empty message of at most {0} characters.", maxRemoteMessageLength));
	}
	return { session: input.session.trim(), message: input.message };
}

/** Routes approved messages without opening a chat or changing its execution configuration. */
export class RemoteSessionMessageRouter extends Disposable {
	// In-flight requests do not expire; settled results remain available for retries.
	private readonly requests = new Map<string, { readonly input: ISendRemoteMessageOptions; readonly result: Promise<ISendRemoteMessageResult>; expiresAt?: number }>();
	private readonly requestCleanup = this._register(new RunOnceScheduler(() => this.expireRequests(), remoteMessageRetryWindowMs));
	private readonly sentMessages = new SessionActionLimiter(maxSentMessages, orchestrationLimitWindowMs, Date.now);
	private readonly sends = new SequencerByKey<string>();

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRemoteSessionChatService private readonly backgroundChats: IRemoteSessionChatService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super();
	}

	override dispose(): void {
		this.requests.clear();
		super.dispose();
	}

	async prepareTarget(source: URI, target: string, token: CancellationToken): Promise<IRemoteMessageTarget> {
		const resolved = await this.resolve(source, target, token);
		return this.describeTarget(resolved.target);
	}

	send(source: URI, options: ISendRemoteMessageOptions, requestId: string, token: CancellationToken): Promise<ISendRemoteMessageResult> {
		this.checkEnabled();
		const key = JSON.stringify([getComparisonKey(source), requestId]);
		const input = { session: options.session, message: options.message };
		const previous = this.requests.get(key);
		if (previous) {
			if (previous.expiresAt !== undefined && previous.expiresAt <= Date.now()) {
				this.requests.delete(key);
			} else {
				if (previous.input.session !== input.session || previous.input.message !== input.message) {
					throw new Error(localize('remoteMessage.changedRetry', "A remote message request cannot be retried with different arguments."));
				}
				return previous.result;
			}
		}
		const result = this.sendRequest(key, source, options, token);
		this.requests.set(key, { input, result });
		return result;
	}

	private async sendRequest(key: string, source: URI, options: ISendRemoteMessageOptions, token: CancellationToken): Promise<ISendRemoteMessageResult> {
		try {
			return await this.queueSend(source, options, token);
		} catch (error) {
			if (error instanceof RemoteMessageLimitError) {
				this.requests.delete(key);
			}
			throw error;
		} finally {
			const request = this.requests.get(key);
			if (request) {
				request.expiresAt = Date.now() + remoteMessageRetryWindowMs;
				if (!this.requestCleanup.isScheduled()) {
					this.requestCleanup.schedule();
				}
			}
		}
	}

	private expireRequests(): void {
		const now = Date.now();
		let hasUnexpiredRequests = false;
		for (const [key, request] of this.requests) {
			if (request.expiresAt === undefined) {
				continue;
			}
			if (request.expiresAt <= now) {
				this.requests.delete(key);
			} else {
				hasUnexpiredRequests = true;
			}
		}
		if (hasUnexpiredRequests) {
			// send() checks expiry on access; periodic sweeps avoid a timer per request.
			this.requestCleanup.schedule();
		}
	}

	private async queueSend(sourceResource: URI, options: ISendRemoteMessageOptions, token: CancellationToken): Promise<ISendRemoteMessageResult> {
		const { source, target } = await this.resolve(sourceResource, options.session, token);
		const session = getComparisonKey(source.session.resource);
		const limit = getGlobalConfigurationValue<string>(this.configurationService, AgentHostAgentOrchestrationLimitsSettingId) === 'off' ? undefined : this.sentMessages.getLimit(session);
		if (limit) {
			throw new RemoteMessageLimitError(limit.retryAfterSeconds === undefined
				? localize('remoteMessage.pendingLimit', "Remote message limit reached: this session has sent {0} of {1} messages in the last {2} minutes, with {3} more in progress. Wait for a send to finish, or turn off {4} in settings.", limit.used, limit.max, limit.windowMinutes, limit.pending, AgentHostAgentOrchestrationLimitsSettingId)
				: localize('remoteMessage.limit', "Remote message limit reached: this session has sent {0} of {1} messages in the last {2} minutes. Retry after {3} seconds, or turn off {4} in settings.", limit.used, limit.max, limit.windowMinutes, limit.retryAfterSeconds, AgentHostAgentOrchestrationLimitsSettingId));
		}
		const reservation = this.sentMessages.reserve(session);
		let mayHaveDelivered = false;
		try {
			return await this.sends.queue(getComparisonKey(target.chat), () => this.doSend(source, target, options, token, () => { mayHaveDelivered = true; }));
		} finally {
			reservation.dispose();
			if (mayHaveDelivered) {
				this.sentMessages.record(session);
			}
		}
	}

	private checkEnabled(): void {
		if (!areRemoteSessionToolsEnabled(this.configurationService)) {
			throw new Error(localize('remoteMessage.disabled', "Remote session tools are disabled."));
		}
	}

	private resolveChat(resource: URI): IResolvedRemoteChat {
		// A restored peer may not be in the UI catalog; its exact URI is validated against host state before dispatch.
		const parent = resolveRemoteSessionChat(resource.with({ fragment: '' }), this.sessionsService, this.connectionsService);
		return this.resolveProvider(parent, resource);
	}

	private resolveProvider(chat: IRemoteSessionChat, resource = chat.chat.resource): IResolvedRemoteChat {
		const provider = this.providersService.getProvider(chat.session.providerId, chat.session.sessionId);
		if (!provider || !isAgentHostProvider(provider) || (provider.connectionStatus && provider.connectionStatus.get().kind !== 'connected')) {
			throw new Error(localize('remoteMessage.unregisteredProvider', "The agent host provider for {0} is not registered and connected in this Agents window.", resource.toString()));
		}
		return { ...chat, chat: resource, hostLabel: provider.label };
	}

	private async resolve(sourceResource: URI, targetReference: string, token: CancellationToken): Promise<{ source: IResolvedRemoteSource; target: IResolvedRemoteChat }> {
		this.checkEnabled();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const sourceContext = await resolveRemoteSessionSource(sourceResource, this.sessionsService, this.connectionsService, token);
		const source: IResolvedRemoteSource = { ...this.resolveProvider(sourceContext), sourceChat: sourceContext.sourceChat };
		if (targetReference === 'origin') {
			const origin = sourceContext.origin;
			if (!origin) {
				throw new Error(localize('remoteMessage.noOrigin', "This session has no saved remote-session origin."));
			}
			targetReference = origin.chat;
		}
		const { resource: targetResource } = await resolveRemoteSessionReference(targetReference, this.connectionsService);
		const target = this.resolveChat(targetResource);
		if (isEqual(source.chat, target.chat)) {
			throw new Error(localize('remoteMessage.self', "A chat cannot send a remote message to itself."));
		}
		const targetChat = this.sessionsService.getSessionForChatResource(target.chat)?.chat;
		if (target.session.isArchived.get() || (targetChat && targetChat.interactivity.get() !== ChatInteractivity.Full)) {
			throw new Error(localize('remoteMessage.readOnly', "The target chat is archived or read-only."));
		}
		this.checkConnected(source);
		this.checkEnabled();
		return { source, target };
	}

	private checkConnected(chat: IResolvedRemoteChat): void {
		const current = this.resolveChat(chat.chat);
		if (current.host.connection !== chat.host.connection || current.host.connectionAuthority !== chat.host.connectionAuthority || current.clientId !== chat.clientId
			|| !isEqual(current.host.backendSession, chat.host.backendSession)) {
			throw new Error(localize('remoteMessage.connectionChanged', "The agent host connection changed. The message was not sent on the replacement connection."));
		}
	}

	private describeTarget(target: IResolvedRemoteChat): IRemoteMessageTarget {
		return {
			session: target.session.resource.toString(),
			chat: target.chat.toString(),
			openLink: buildOpenSessionLinkUri(target.session.resource, target.chat.fragment),
			host: { id: target.session.providerId, label: target.hostLabel },
		};
	}

	private async checkTargetTrust(target: IResolvedRemoteChat, state: SessionState, token: CancellationToken): Promise<void> {
		if (!readSessionWorkspaceless(state._meta) && state.workingDirectories === undefined) {
			throw new Error(localize('remoteMessage.unknownWorkspace', "The target session's working directories are unavailable. Open the session before sending a remote message."));
		}
		const folders = await raceCancellationError(resolveAgentHostSessionTrustFolders(
			state, this.workspaceTrustService, resource => target.host.connection.resourceUris.fromAgentHost(resource),
		), token);
		if (folders === undefined) {
			return;
		}
		const trusted = folders.length === 0
			? this.workspaceTrustService.isWorkspaceTrusted()
			: (await raceCancellationError(Promise.all(folders.map(folder => this.workspaceTrustService.getUriTrustInfo(folder))), token)).every(info => info.trusted);
		if (!trusted) {
			throw new Error(localize('remoteMessage.untrustedWorkspace', "The target session's workspace is not trusted. Trust it before sending a remote message."));
		}
	}

	private async doSend(source: IResolvedRemoteSource, target: IResolvedRemoteChat, options: ISendRemoteMessageOptions, token: CancellationToken, onMayHaveDelivered: () => void): Promise<ISendRemoteMessageResult> {
		const store = new DisposableStore();
		let dispatched = false;
		let rejected = false;
		let confirmed = false;
		let started = false;
		let operationError: Error | undefined;
		let background: IRemoteSessionChatReference | undefined;
		try {
			const cancellation = store.add(new CancellationTokenSource(token));
			store.add(disposableTimeout(() => {
				operationError = new Error(dispatched
					? localize('remoteMessage.acknowledgementTimeout', "Timed out waiting for remote message acknowledgement.")
					: localize('remoteMessage.preparationTimeout', "Timed out preparing the remote message."));
				cancellation.cancel();
			}, 10_000));
			const checkConnections = () => {
				try {
					this.checkConnected(source);
					this.checkConnected(target);
				} catch (error) {
					operationError = error instanceof Error ? error : new Error(toErrorMessage(error));
					cancellation.cancel();
				}
			};
			store.add(this.connectionsService.onDidChangeConnections(checkConnections));
			checkConnections();
			const connection = target.host.connection;
			const session = store.add(connection.getSubscription(StateComponents.Session, target.host.backendSession, 'RemoteSessionMessageRouter'));
			const sessionState = await readRemoteSessionState(session.object, cancellation.token, true);
			// A chat listed in the backend session's catalog belongs to that session.
			const chatResource = getSessionChatResource(sessionState, target.chat.fragment || DEFAULT_CHAT_ID, sessionState.defaultChat);
			if (!chatResource) {
				throw new Error(localize('remoteMessage.missingChat', "The exact target chat no longer exists on its agent host."));
			}
			const chat = store.add(connection.getSubscription(StateComponents.Chat, URI.parse(chatResource), 'RemoteSessionMessageRouter'));
			const chatState = await readRemoteSessionState(chat.object, cancellation.token, true);
			if (!isEqual(URI.parse(chatState.resource), URI.parse(chatResource))) {
				throw new Error(localize('remoteMessage.chatChanged', "The target chat identity changed while preparing the message."));
			}
			if (effectiveChatInteractivity(chatState.interactivity, isSessionStatusArchived(sessionState.status)) !== ProtocolChatInteractivity.Full) {
				throw new Error(localize('remoteMessage.readOnly', "The target chat is archived or read-only."));
			}
			await this.checkTargetTrust(target, sessionState, cancellation.token);
			background = await this.backgroundChats.acquire(target.chat, cancellation.token, true);
			await this.checkTargetTrust(target, await readRemoteSessionState(session.object, cancellation.token, true), cancellation.token);
			this.checkEnabled();
			this.checkConnected(source);
			this.checkConnected(target);
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const messageId = generateUuid();
			const accepted = new Promise<void>((resolve, reject) => {
				store.add(connection.onDidAction(envelope => {
					if (!isEqual(URI.parse(envelope.channel), URI.parse(chatResource))) {
						return;
					}
					const action = envelope.action;
					if (action.type === ActionType.ChatTurnStarted && action.queuedMessageId === messageId) {
						started = !envelope.rejectionReason;
					}
					if (action.type === ActionType.ChatPendingMessageSet && action.id === messageId) {
						if (envelope.rejectionReason) {
							rejected = true;
							reject(new Error(envelope.rejectionReason));
						} else {
							confirmed = true;
							resolve();
						}
					}
				}));
			});
			// Always enqueue: admission on the host preserves FIFO even if another client starts a turn concurrently.
			dispatched = true;
			connection.dispatch(chatResource, {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Queued,
				id: messageId,
				message: {
					text: options.message,
					origin: { kind: MessageKind.Agent },
					_meta: toRemoteSessionMessageMetadata(source.session.resource.toString(), source.sourceChat),
				},
			});
			await raceCancellationError(accepted, cancellation.token);
		} catch (error) {
			if (!confirmed && dispatched && !rejected) {
				throw new Error(localize('remoteMessage.unconfirmed', "Remote message delivery was not confirmed. It may already be queued; do not retry automatically. {0}", toErrorMessage(operationError ?? error)));
			}
			if (!confirmed) {
				throw operationError ?? error;
			}
		} finally {
			if (confirmed || (dispatched && !rejected)) {
				onMayHaveDelivered();
				background?.releaseWhenIdle();
			} else {
				background?.dispose();
			}
			store.dispose();
		}
		return { ...this.describeTarget(target), status: started ? 'sent' : 'queued' };
	}
}
