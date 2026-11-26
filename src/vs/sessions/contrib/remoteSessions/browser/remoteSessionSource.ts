/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity, IAgentHostSessionResolution, isDefaultChatLinkId } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRemoteSessionOrigin, readRemoteSessionDepth, readRemoteSessionOrigin } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { withRoutedModel } from '../../../../platform/agentHost/common/modelRouter.js';
import { AGENT_HOST_SESSION_LINK_SCHEME, parseOpenSessionLinkChatId, parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { DEFAULT_CHAT_ID, getSessionChatResource, StateComponents, type ModelSelection } from '../../../../platform/agentHost/common/state/sessionState.js';
import { isAgentHostSessionResource } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChat, ISession } from '../../../../workbench/services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

export interface IRemoteSessionChat {
	readonly session: ISession;
	readonly chat: IChat;
	readonly host: IAgentHostSessionResolution;
	readonly clientId: string;
}

/** The model a source chat runs on, as its agent host recorded it. */
export interface IRemoteSessionSourceModel {
	/** The agent provider backing the source chat. */
	readonly provider: string;
	/** The provider-native model ID and its configuration, such as reasoning effort and context size. */
	readonly selection: ModelSelection;
}

export interface IRemoteSessionSource extends IRemoteSessionChat {
	readonly depth: number;
	readonly origin: IRemoteSessionOrigin | undefined;
	/** The source chat's recorded resource in the backend session's chat list. */
	readonly sourceChat: string;
	/** The source chat's model, when requested and its host recorded one. */
	readonly model?: IRemoteSessionSourceModel;
}

export function assertRemoteSessionCaller(resource: URI): void {
	if (!isAgentHostSessionResource(resource)) {
		throw new Error(localize('remoteMessage.unsupportedSource', "Remote delegation requires an originating chat on an Agent Host. Other chat providers are not supported."));
	}
}

/** A fragment naming the session's advertised default chat addresses the session itself. */
async function isDefaultChatFragment(resource: URI, connectionsService: IAgentHostConnectionsService): Promise<boolean> {
	if (!resource.fragment) {
		return false;
	}
	const resolution = connectionsService.resolveSessionResource(resource.with({ fragment: '' }));
	return !!resolution && await isDefaultChatLinkId(resolution.connection, resolution.backendSession, resource.fragment);
}

export async function resolveRemoteSessionReference(reference: string, connectionsService: IAgentHostConnectionsService): Promise<{ resource: URI; identity: IAgentHostSessionIdentity }> {
	let resource = URI.parse(reference, true);
	if (resource.scheme === AGENT_HOST_SESSION_LINK_SCHEME) {
		const session = parseOpenSessionLinkUri(resource);
		const chatId = parseOpenSessionLinkChatId(resource);
		const parameters = new URLSearchParams(resource.query);
		if (!session || resource.fragment || parameters.getAll('chat').length > 1
			|| [...parameters.keys()].some(key => key !== 'chat' && key !== 'turn' && key !== 'session' && key !== 'connectionAuthority')
			|| (parameters.has('chat') && !chatId && parameters.get('chat') !== DEFAULT_CHAT_ID)) {
			throw new Error(localize('remoteMessage.invalidLink', "The remote session link is invalid."));
		}
		const authority = parseOpenSessionLinkConnectionAuthority(resource);
		const qualified = authority ? connectionsService.findSessionResource(session, authority) : session;
		if (!qualified) {
			throw new Error(localize('remoteMessage.unqualifiedReference', "Use an exact host-qualified session or chat reference returned by the remote session tools."));
		}
		resource = qualified.with({ fragment: chatId ?? '' });
	}
	const identity = connectionsService.resolveSessionResourceIdentity(resource.with({ fragment: '' }));
	if (!resource.path.startsWith('/') || resource.path.length === 1 || !identity
		|| ((resource.authority || resource.query) && !identity.backendSessionIsAdvertised)) {
		throw new Error(localize('remoteMessage.unqualifiedReference', "Use an exact host-qualified session or chat reference returned by the remote session tools."));
	}
	return { resource: resource.fragment === DEFAULT_CHAT_ID || await isDefaultChatFragment(resource, connectionsService) ? resource.with({ fragment: '' }) : resource, identity };
}

export function resolveRemoteSessionChat(resource: URI, sessionsService: ISessionsManagementService, connectionsService: IAgentHostConnectionsService): IRemoteSessionChat {
	const context = sessionsService.getSessionForChatResource(resource);
	const session = context?.session ?? (!resource.fragment ? sessionsService.getSession(resource) : undefined);
	const chat = context?.chat ?? session?.mainChat.get();
	if (!session || !chat) {
		throw new Error(localize('remoteMessage.unknownChat', "The exact session or chat is no longer available: {0}", resource.toString()));
	}
	const host = connectionsService.resolveSessionResource(session.resource);
	const root = host?.connection.rootState.value;
	if (!host || !root || root instanceof Error) {
		throw new Error(localize('remoteMessage.offline', "The agent host for {0} is not registered and connected in this Agents window.", resource.toString()));
	}
	return { session, chat, host, clientId: host.connection.clientId };
}

export function assertRemoteSessionSource(source: IRemoteSessionChat, sessionsService: ISessionsManagementService, connectionsService: IAgentHostConnectionsService): void {
	const current = resolveRemoteSessionChat(source.chat.resource, sessionsService, connectionsService);
	if (current.host.connection !== source.host.connection || current.clientId !== source.clientId
		|| current.host.connectionAuthority !== source.host.connectionAuthority
		|| !isEqual(current.host.backendSession, source.host.backendSession)
		|| !isEqual(current.chat.resource, source.chat.resource)) {
		throw new Error(localize('remoteMessage.sourceChanged', "The originating chat or agent host connection changed."));
	}
}

/**
 * Resolves the caller's exact chat and persisted cumulative depth without retaining a subscription.
 * @param readModel Whether to also read the model the chat runs on ({@link IRemoteSessionSource.model}).
 */
export async function resolveRemoteSessionSource(
	sourceResource: URI,
	sessionsService: ISessionsManagementService,
	connectionsService: IAgentHostConnectionsService,
	token: CancellationToken,
	readModel = false,
): Promise<IRemoteSessionSource> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	assertRemoteSessionCaller(sourceResource);
	const source = resolveRemoteSessionChat(sourceResource, sessionsService, connectionsService);
	const store = new DisposableStore();
	let failure: Error | undefined;
	try {
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(disposableTimeout(() => {
			failure = new Error(localize('remoteMessage.sourceTimeout', "Timed out reading the originating session's state."));
			cancellation.cancel();
		}, 10_000));
		const checkSource = () => assertRemoteSessionSource(source, sessionsService, connectionsService);
		store.add(connectionsService.onDidChangeConnections(() => {
			try {
				checkSource();
			} catch (error) {
				failure = error instanceof Error ? error : new Error(toErrorMessage(error));
				cancellation.cancel();
			}
		}));
		const subscription = store.add(source.host.connection.getSubscription(StateComponents.Session, source.host.backendSession, 'RemoteSessionSource'));
		const state = await readRemoteSessionState(subscription.object, cancellation.token);
		if (cancellation.token.isCancellationRequested) {
			throw new CancellationError();
		}
		checkSource();
		// A chat listed in the backend session's catalog belongs to that session.
		const defaultChat = state.defaultChat;
		const chatResource = getSessionChatResource(state, source.chat.resource.fragment || DEFAULT_CHAT_ID, defaultChat);
		if (!chatResource) {
			throw new Error(localize('remoteMessage.sourceChatMissing', "The exact originating chat no longer exists on its agent host."));
		}
		let model: IRemoteSessionSourceModel | undefined;
		if (readModel) {
			const chatSubscription = store.add(source.host.connection.getSubscription(StateComponents.Chat, URI.parse(chatResource), 'RemoteSessionSource'));
			const chat = await readRemoteSessionState(chatSubscription.object, cancellation.token);
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			checkSource();
			// The turn in progress is the one delegating; otherwise the chat continues on its draft's or latest turn's model.
			// A message without a model runs on the host default. A router isn't a model: like create_session, the
			// session continues on the model the router chose.
			const requested = chat.activeTurn ? chat.activeTurn.message.model : chat.draft ? chat.draft.model : chat.turns.at(-1)?.message.model;
			const selection = withRoutedModel(chat, requested);
			model = selection && { provider: chat.provider ?? state.provider, selection };
		}
		return { ...source, depth: readRemoteSessionDepth(state), origin: readRemoteSessionOrigin(state), sourceChat: chatResource, ...(model ? { model } : {}) };
	} catch (error) {
		throw failure ?? error;
	} finally {
		store.dispose();
	}
}

export function readRemoteSessionState<T>(subscription: IAgentSubscription<T>, token: CancellationToken, verifiedOnly = false): Promise<T> {
	if (token.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}
	const read = () => subscription.value instanceof Error ? subscription.value : verifiedOnly ? subscription.verifiedValue : subscription.value;
	const value = read();
	if (value !== undefined) {
		return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
	}
	const changed = Event.any(
		Event.map(subscription.onDidChange, () => undefined),
		Event.map(subscription.onDidError ?? Event.None, () => undefined),
	);
	return new Promise<T>((resolve, reject) => {
		const store = new DisposableStore();
		const check = () => {
			const value = read();
			if (token.isCancellationRequested) {
				store.dispose();
				reject(new CancellationError());
			} else if (value !== undefined) {
				store.dispose();
				if (value instanceof Error) {
					reject(value);
				} else {
					resolve(value);
				}
			}
		};
		store.add(changed(check));
		store.add(token.onCancellationRequested(check));
		check();
	});
}
