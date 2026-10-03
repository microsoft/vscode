/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../platform/agentHost/common/agentHostUri.js';
import { buildOpenSessionLinkUri } from '../../../../platform/agentHost/common/openSessionLink.js';
import { DEFAULT_CHAT_ID, getSessionChatResource, parseChatUri, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteSessionInspectionResult, remoteSessionSnapshot } from '../common/remoteSessionInspection.js';
import { areRemoteSessionToolsEnabled } from '../common/remoteSessions.js';
import { readRemoteSessionState, resolveRemoteSessionReference } from './remoteSessionSource.js';

export class RemoteSessionInspector {
	constructor(
		@IAgentHostConnectionsService private readonly connectionsService: IAgentHostConnectionsService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) { }

	async inspect(reference: string, token: CancellationToken): Promise<IRemoteSessionInspectionResult> {
		this.checkEnabled();
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const { resource, identity } = resolveRemoteSessionReference(reference, this.connectionsService);
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider =>
			provider.remoteAddress !== undefined && agentHostAuthority(provider.remoteAddress) === identity.connectionAuthority);
		if (!provider) {
			throw new Error(localize('remoteInspection.unknownHost', "Use a session or chat on a remote agent host registered in this Agents window."));
		}
		const sessionResource = resource.with({ fragment: '' });
		const target = {
			session: sessionResource.toString(),
			chat: resource.toString(),
			openLink: buildOpenSessionLinkUri(sessionResource, resource.fragment),
			host: { id: provider.id, label: provider.label },
		};
		const connection = this.connectionsService.getConnectionByAuthority(identity.connectionAuthority);
		const connectionStatus = provider.connectionStatus?.get().kind ?? 'disconnected';
		if (!connection || connectionStatus !== 'connected') {
			return { ...target, status: 'unavailable', reason: localize('remoteInspection.offline', "The agent host is {0}. Inspection does not reconnect it.", connectionStatus) };
		}
		const clientId = connection.clientId;
		const store = new DisposableStore();
		let failure: Error | undefined;
		try {
			const cancellation = store.add(new CancellationTokenSource(token));
			store.add(disposableTimeout(() => {
				failure = new Error(localize('remoteInspection.timeout', "Timed out reading the remote session's state."));
				cancellation.cancel();
			}, 10_000));
			const checkConnection = () => {
				const current = this.connectionsService.resolveSessionResource(sessionResource);
				if (current?.connection !== connection || connection.clientId !== clientId
					|| current.connectionAuthority !== identity.connectionAuthority
					|| !isEqual(current.backendSession, identity.backendSession)
					|| provider.connectionStatus?.get().kind !== 'connected'
					|| !this.providersService.getProviders().includes(provider)) {
					throw new Error(localize('remoteInspection.connectionChanged', "The remote agent host disconnected or its connection changed during inspection."));
				}
			};
			store.add(this.connectionsService.onDidChangeSessionResolution(() => {
				try {
					checkConnection();
				} catch (error) {
					failure = error instanceof Error ? error : new Error(toErrorMessage(error));
					cancellation.cancel();
				}
			}));
			checkConnection();
			const session = store.add(connection.getSubscription(StateComponents.Session, identity.backendSession, 'RemoteSessionInspector'));
			const sessionState = await readRemoteSessionState(session.object, cancellation.token, true);
			this.checkEnabled();
			checkConnection();
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			const chatResource = getSessionChatResource(sessionState, resource.fragment || DEFAULT_CHAT_ID);
			const chatIdentity = chatResource ? parseChatUri(chatResource) : undefined;
			if (!chatResource || !chatIdentity || !isEqual(URI.parse(chatIdentity.session), identity.backendSession)) {
				throw new Error(localize('remoteInspection.missingChat', "The exact target chat no longer exists on its agent host."));
			}
			const chat = store.add(connection.getSubscription(StateComponents.Chat, URI.parse(chatResource), 'RemoteSessionInspector'));
			const chatState = await readRemoteSessionState(chat.object, cancellation.token, true);
			if (!isEqual(URI.parse(chatState.resource), URI.parse(chatResource))) {
				throw new Error(localize('remoteInspection.chatChanged', "The target chat identity changed during inspection."));
			}
			this.checkEnabled();
			checkConnection();
			if (cancellation.token.isCancellationRequested) {
				throw new CancellationError();
			}
			return { ...target, ...remoteSessionSnapshot(chatState) };
		} catch (error) {
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}
			this.checkEnabled();
			const reason = toErrorMessage(failure ?? error);
			this.logService.warn(`[RemoteSessions] Could not inspect ${resource.toString()}`, failure ?? error);
			return { ...target, status: 'unavailable', reason };
		} finally {
			store.dispose();
		}
	}

	private checkEnabled(): void {
		if (!areRemoteSessionToolsEnabled(this.configurationService)) {
			throw new Error(localize('remoteInspection.disabled', "Remote session tools are disabled."));
		}
	}
}
