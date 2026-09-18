/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellationError, SequencerByKey } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { resolveAgentHostSessionTrustFolders } from '../../../../platform/agentHost/common/agentHostWorkspaceTrust.js';
import { toRemoteSessionMessageMetadata } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { buildOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ChatInteractivity as ProtocolChatInteractivity } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { DEFAULT_CHAT_ID, effectiveChatInteractivity, getSessionChatResource, isSessionStatusArchived, MessageKind, parseChatUri, PendingMessageKind, readSessionWorkspaceless, SessionState, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { IRemoteSessionChat, readRemoteSessionState, resolveRemoteSessionChat, resolveRemoteSessionReference, resolveRemoteSessionSource } from './remoteSessionSource.js';
import { IRemoteSessionChatReference, IRemoteSessionChatService } from './remoteSessionChatService.js';

const maxRemoteMessages = 50;
export const maxRemoteMessageLength = 64 * 1024;

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
export class RemoteSessionMessageRouter {
	private readonly requests = new Map<string, { readonly input: string; readonly result: Promise<ISendRemoteMessageResult> }>();
	private readonly sends = new SequencerByKey<string>();

	constructor(
		@ISessionsManagementService private readonly sessionsService: ISessionsManagementService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRemoteSessionChatService private readonly backgroundChats: IRemoteSessionChatService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
	) { }

	async prepareTarget(source: URI, target: string, token: CancellationToken): Promise<IRemoteMessageTarget> {
		const resolved = await this.resolve(source, target, token);
		return this.describeTarget(resolved.target);
	}

	send(source: URI, options: ISendRemoteMessageOptions, requestId: string, token: CancellationToken): Promise<ISendRemoteMessageResult> {
		this.checkEnabled();
		const key = JSON.stringify([getComparisonKey(source), requestId]);
		const input = JSON.stringify(options);
		const previous = this.requests.get(key);
		if (previous) {
			if (previous.input !== input) {
				throw new Error(localize('remoteMessage.changedRetry', "A remote message request cannot be retried with different arguments."));
			}
			return previous.result;
		}
		if (this.requests.size >= maxRemoteMessages) {
			throw new Error(localize('remoteMessage.limit', "Remote message limit reached ({0} requests per window).", maxRemoteMessages));
		}
		const result = this.queueSend(source, options, token);
		this.requests.set(key, { input, result });
		return result;
	}

	private async queueSend(sourceResource: URI, options: ISendRemoteMessageOptions, token: CancellationToken): Promise<ISendRemoteMessageResult> {
		const { source, target } = await this.resolve(sourceResource, options.session, token);
		return this.sends.queue(getComparisonKey(target.chat), () => this.doSend(source, target, options, token));
	}

	private checkEnabled(): void {
		if (this.configurationService.getValue<boolean>('chat.disableAIFeatures')
			|| this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) !== true) {
			throw new Error(localize('remoteMessage.disabled', "Remote agent hosts are disabled."));
		}
	}

	private resolveChat(resource: URI): IResolvedRemoteChat {
		// A restored peer may not be in the UI catalog; its exact URI is validated against host state before dispatch.
		const parent = resolveRemoteSessionChat(resource.with({ fragment: '' }), this.sessionsService, this.connectionsService);
		return this.resolveProvider(parent, resource);
	}

	private resolveProvider(chat: IRemoteSessionChat, resource = chat.chat.resource): IResolvedRemoteChat {
		const provider = this.providersService.getProvider(chat.session.providerId);
		if (!provider || !isAgentHostProvider(provider) || (provider.connectionStatus && provider.connectionStatus.get().kind !== 'connected')) {
			throw new Error(localize('remoteMessage.unregisteredProvider', "The agent host provider for {0} is not registered and connected in this Agents window.", resource.toString()));
		}
		return { ...chat, chat: resource, hostLabel: provider.label };
	}

	private async resolve(sourceResource: URI, targetReference: string, token: CancellationToken): Promise<{ source: IResolvedRemoteChat; target: IResolvedRemoteChat }> {
		this.checkEnabled();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const sourceContext = await resolveRemoteSessionSource(sourceResource, this.sessionsService, this.connectionsService, token);
		const source = this.resolveProvider(sourceContext);
		if (targetReference === 'origin') {
			const origin = sourceContext.origin;
			if (!origin) {
				throw new Error(localize('remoteMessage.noOrigin', "This session has no saved remote-session origin."));
			}
			targetReference = origin.chat;
		}
		const { resource: targetResource } = resolveRemoteSessionReference(targetReference, this.connectionsService);
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

	private async doSend(source: IResolvedRemoteChat, target: IResolvedRemoteChat, options: ISendRemoteMessageOptions, token: CancellationToken): Promise<ISendRemoteMessageResult> {
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
			const chatResource = getSessionChatResource(sessionState, target.chat.fragment || DEFAULT_CHAT_ID);
			const identity = chatResource ? parseChatUri(chatResource) : undefined;
			if (!chatResource || !identity || !isEqual(URI.parse(identity.session), target.host.backendSession)) {
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
					_meta: toRemoteSessionMessageMetadata({
						session: source.session.resource.toString(),
						chat: source.chat.toString(),
					}),
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
				background?.releaseWhenIdle();
			} else {
				background?.dispose();
			}
			store.dispose();
		}
		return { ...this.describeTarget(target), status: started ? 'sent' : 'queued' };
	}
}
