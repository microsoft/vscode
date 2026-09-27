/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { ArtifactProtocolChatAccess } from '../../../../platform/agentHost/common/artifactIntegrationChat.js';
import { getAgentHostArtifactIntegrationsCapability } from '../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { readSessionArtifacts } from '../../../../platform/agentHost/common/sessionArtifacts.js';
import { ChatState, isSessionStatusArchived, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { ArtifactIntegrationRegistry, IArtifactIntegrationRegistry } from '../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactIntegrationService } from '../../../../platform/artifactIntegrations/common/artifactIntegrationService.js';
import { ArtifactSessionState, IArtifactIntegrationStorage, IArtifactRuntime } from '../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export function createClientArtifactRuntime(
	authority: string,
	targetHost: string,
	storage: IArtifactIntegrationStorage,
	isOwner: () => boolean,
	connection: IAgentConnection,
	permitted: IObservable<boolean>,
	registry: ArtifactIntegrationRegistry,
	logService: ILogService,
): ArtifactIntegrationService {
	const lifetime = new DisposableStore();
	const available = derived(reader => permitted.read(reader) && connection.connectionAvailable?.read(reader) === true && getAgentHostArtifactIntegrationsCapability(connection.initializeResult.read(reader)) === 'unsupported');
	const chat = lifetime.add(new ArtifactProtocolChatAccess({
		admission: 'bestEffort',
		available: connection.connectionAvailable ?? constObservable(false),
		onDidAction: connection.onDidAction,
		acquireChat: async (_session, chat) => {
			const reference = connection.getSubscription(StateComponents.Chat, URI.parse(chat), 'artifactIntegrations');
			return {
				object: subscriptionObservable(reference.object),
				dispose: () => reference.dispose(),
			};
		},
		dispatch: (chat, action) => {
			const startsWork = action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatPendingMessageSet;
			if ((startsWork && !available.get()) || !connection.dispatchBackgroundChatAction || connection.connectionAvailable?.get() !== true) {
				throw new Error(localize('artifactBackgroundSendUnavailable', "Background delivery is unavailable for this agent host."));
			}
			return connection.dispatchBackgroundChatAction(chat, action);
		},
	}));
	const runtime: IArtifactRuntime = {
		authority: { id: authority, targetHost, location: 'client' },
		available, chat, isOwner,
		acquireSession: async session => {
			const reference = connection.getSubscription(StateComponents.Session, URI.parse(session), 'artifactIntegrations');
			const value = observableFromEvent(reference, Event.any(reference.object.onDidChange, reference.object.onDidError ?? Event.None), (): ArtifactSessionState => {
				const error = reference.object.value instanceof Error ? reference.object.value : undefined;
				const state = reference.object.verifiedValue;
				return {
					availability: error ? { kind: 'error', reason: error.message } : state ? { kind: 'available' } : { kind: 'loading' },
					archived: isSessionStatusArchived(state?.status),
					artifacts: readSessionArtifacts(state?._meta).flatMap(artifact => {
						const resource = artifact.link ?? artifact.uri;
						return resource ? [{ id: artifact.id, label: artifact.label, resource, origin: artifact.origin }] : [];
					}),
				};
			});
			return { object: value, dispose: () => reference.dispose() };
		},
		authorize: async (_context, scope) => {
			if (!available.get()) {
				return { kind: 'blocked', reason: localize('artifactClientPaused', "Runs on this computer while connected. This runtime is currently paused.") };
			}
			return scope === 'resourceAndWorkspace'
				? { kind: 'blocked', reason: localize('artifactRemoteWorkspaceUnavailable', "This client cannot reserve the agent host's workspace for an artifact action.") }
				: { kind: 'allowed' };
		},
	};
	return new ClientArtifactIntegrationService(runtime, storage, registry, logService, lifetime);
}

function subscriptionObservable(subscription: IAgentSubscription<ChatState>): IObservable<ChatState | Error | undefined> {
	return observableFromEvent(subscription, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None),
		() => subscription.value instanceof Error ? subscription.value : subscription.verifiedValue);
}

class ClientArtifactIntegrationService extends ArtifactIntegrationService {
	constructor(runtime: IArtifactRuntime, storage: IArtifactIntegrationStorage, registry: ArtifactIntegrationRegistry, logService: ILogService, lifetime: DisposableStore) {
		super(runtime, storage, registry, logService);
		this._register(lifetime);
	}
}

registerSingleton(IArtifactIntegrationRegistry, ArtifactIntegrationRegistry, InstantiationType.Delayed);
