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
import { IAgentHostConnectionsService, IAgentHostSessionIdentity, IAgentHostSessionResolution } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IRemoteSessionOrigin, readRemoteSessionDepth, readRemoteSessionOrigin } from '../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { AGENT_HOST_SESSION_LINK_SCHEME, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { DEFAULT_CHAT_ID, getSessionChatResource, parseChatUri, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export interface IRemoteSessionChat {
	readonly session: ISession;
	readonly chat: IChat;
	readonly host: IAgentHostSessionResolution;
	readonly clientId: string;
}

export interface IRemoteSessionSource extends IRemoteSessionChat {
	readonly depth: number;
	readonly origin: IRemoteSessionOrigin | undefined;
}

export function resolveRemoteSessionReference(reference: string, connectionsService: IAgentHostConnectionsService): { resource: URI; identity: IAgentHostSessionIdentity } {
	let resource = URI.parse(reference, true);
	if (resource.scheme === AGENT_HOST_SESSION_LINK_SCHEME) {
		const session = parseOpenSessionLinkUri(resource);
		const chatId = parseOpenSessionLinkChatId(resource);
		const parameters = new URLSearchParams(resource.query);
		if (!session || resource.fragment || parameters.getAll('chat').length > 1
			|| [...parameters.keys()].some(key => key !== 'chat' && key !== 'turn')
			|| (parameters.has('chat') && !chatId && parameters.get('chat') !== DEFAULT_CHAT_ID)) {
			throw new Error(localize('remoteMessage.invalidLink', "The remote session link is invalid."));
		}
		resource = session.with({ fragment: chatId ?? '' });
	}
	const identity = connectionsService.resolveSessionResourceIdentity(resource.with({ fragment: '' }));
	if (resource.authority || resource.query || !resource.path.startsWith('/') || resource.path.length === 1 || !identity) {
		throw new Error(localize('remoteMessage.unqualifiedReference', "Use an exact host-qualified session or chat reference returned by the remote session tools."));
	}
	return { resource: resource.fragment === DEFAULT_CHAT_ID ? resource.with({ fragment: '' }) : resource, identity };
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

/** Resolves the caller's exact chat and persisted cumulative depth without retaining a subscription. */
export async function resolveRemoteSessionSource(
	sourceResource: URI,
	sessionsService: ISessionsManagementService,
	connectionsService: IAgentHostConnectionsService,
	token: CancellationToken,
): Promise<IRemoteSessionSource> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	const source = resolveRemoteSessionChat(sourceResource, sessionsService, connectionsService);
	const store = new DisposableStore();
	let failure: Error | undefined;
	try {
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(disposableTimeout(() => {
			failure = new Error(localize('remoteMessage.sourceTimeout', "Timed out reading the originating session's state."));
			cancellation.cancel();
		}, 10_000));
		const checkSource = () => {
			const current = resolveRemoteSessionChat(sourceResource, sessionsService, connectionsService);
			if (current.host.connection !== source.host.connection || current.clientId !== source.clientId
				|| current.host.connectionAuthority !== source.host.connectionAuthority
				|| !isEqual(current.host.backendSession, source.host.backendSession)
				|| !isEqual(current.chat.resource, source.chat.resource)) {
				throw new Error(localize('remoteMessage.sourceChanged', "The originating chat or agent host connection changed."));
			}
		};
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
		const chatResource = getSessionChatResource(state, source.chat.resource.fragment || DEFAULT_CHAT_ID);
		const identity = chatResource ? parseChatUri(chatResource) : undefined;
		if (!identity || !isEqual(URI.parse(identity.session), source.host.backendSession)) {
			throw new Error(localize('remoteMessage.sourceChatMissing', "The exact originating chat no longer exists on its agent host."));
		}
		return { ...source, depth: readRemoteSessionDepth(state), origin: readRemoteSessionOrigin(state) };
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
