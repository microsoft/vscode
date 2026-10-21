/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { AgentHostArtifactIntegrationsConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { AgentMergeConfigKey } from '../../../../platform/agentHost/common/agentMerge.js';
import { ArtifactProtocolChatAccess } from '../../../../platform/agentHost/common/artifactIntegrationChat.js';
import { supportsArtifactIntegrationNotices } from '../../../../platform/agentHost/common/meta/agentHostArtifactIntegrationMeta.js';
import { readSessionArtifacts } from '../../../../platform/agentHost/common/sessionArtifacts.js';
import { isSessionStatusArchived, StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { IAgentSubscription } from '../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType, NotificationType } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { IArtifactIntegrationRegistry } from '../../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactIntegrationService } from '../../../../platform/artifactIntegrations/common/artifactIntegrationService.js';
import { ArtifactSessionState, IArtifactIntegrationStorage, IArtifactRuntime } from '../../../../platform/artifactIntegrations/common/artifactRuntime.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export function createClientArtifactRuntime(
	authority: string,
	targetHost: string,
	storage: IArtifactIntegrationStorage,
	isOwner: () => boolean,
	connection: IAgentConnection,
	permitted: IObservable<boolean>,
	enabled: IObservable<boolean>,
	registry: IArtifactIntegrationRegistry,
	logService: ILogService,
	activateIntegrations?: () => Promise<void>,
): ArtifactIntegrationService {
	const lifetime = new DisposableStore();
	const root = connection.rootState;
	const hostConfig = root ? observableFromEvent(root, root.onDidChange, () => root.verifiedValue?.config) : constObservable(undefined);
	const hostAllowsIntegrations = derived(reader => {
		const config = hostConfig.read(reader);
		const agentMerge = config?.values[AgentMergeConfigKey.Enabled] ?? config?.schema.properties[AgentMergeConfigKey.Enabled]?.default;
		return agentMerge !== true || config?.values[AgentHostArtifactIntegrationsConfigKey] === true;
	});
	const available = derived(reader => permitted.read(reader) && connection.connectionAvailable?.read(reader) === true && hostAllowsIntegrations.read(reader));
	const chat = lifetime.add(new ArtifactProtocolChatAccess({
		admission: 'bestEffort',
		available: connection.connectionAvailable ?? constObservable(false),
		onDidAction: connection.onDidAction,
		acquireChat: async (session, chat) => {
			const store = new DisposableStore();
			try {
				const sessionReference = store.add(connection.getSubscription(StateComponents.Session, URI.parse(session), 'artifactIntegrations'));
				const chatReference = store.add(connection.getSubscription(StateComponents.Chat, URI.parse(chat), 'artifactIntegrations'));
				const sessionState = subscriptionObservable(sessionReference.object);
				const chatState = subscriptionObservable(chatReference.object);
				return {
					object: derived(reader => {
						const state = sessionState.read(reader);
						if (!state || state instanceof Error) {
							return state;
						}
						if (!state.chats.some(candidate => candidate.resource === chat)) {
							return new Error(localize('artifactClientChatMoved', "The artifact's chat no longer belongs to this session."));
						}
						return chatState.read(reader);
					}),
					dispose: () => store.dispose(),
				};
			} catch (error) {
				store.dispose();
				throw error;
			}
		},
		dispatch: (chat, action) => {
			const startsWork = action.type === ActionType.ChatTurnStarted || action.type === ActionType.ChatPendingMessageSet;
			if ((startsWork && !available.get()) || !connection.dispatchBackgroundChatAction || connection.connectionAvailable?.get() !== true) {
				throw new Error(localize('artifactBackgroundSendUnavailable', "Background delivery is unavailable for this agent host."));
			}
			return connection.dispatchBackgroundChatAction(chat, action);
		},
	}));
	// The host notifies removal only for permanent deletion, not for eviction from memory.
	const deletedSessions = lifetime.add(new Emitter<string>());
	lifetime.add(connection.onDidNotification(notification => {
		if (notification.type === NotificationType.SessionRemoved) {
			deletedSessions.fire(URI.parse(notification.session.toString()).toString());
		}
	}));
	const runtime: IArtifactRuntime = {
		authority: { id: authority, targetHost, location: 'client' },
		available, enabled, chat, isOwner,
		onDidDeleteSession: deletedSessions.event,
		automationUnavailableReason: derived(reader => supportsArtifactIntegrationNotices(connection.initializeResult.read(reader)) && !!connection.artifactIntegrationTransport
			? undefined : localize('artifactNoticesUnsupported', "Automatic actions are paused because this agent host does not support the required chat notices. Manual actions remain available.")),
		postNotice: async notice => {
			const transport = connection.artifactIntegrationTransport;
			if (!available.get() || !isOwner() || !supportsArtifactIntegrationNotices(connection.initializeResult.get()) || !transport) {
				throw new Error(localize('artifactNoticeUnavailable', "The agent host cannot receive this artifact automation notice."));
			}
			const subscription = generateUuid();
			try {
				const acquired = await transport.request({ kind: 'acquire', subscription, session: notice.session, artifactId: notice.artifact.id });
				if (acquired.kind !== 'artifact' || !available.get() || !isOwner() || !supportsArtifactIntegrationNotices(connection.initializeResult.get())) {
					throw new Error(localize('artifactNoticeUnavailable', "The agent host cannot receive this artifact automation notice."));
				}
				const result = await transport.request({
					kind: 'notice', subscription, notice: { kind: notice.kind, content: notice.content, iconId: notice.iconId },
				});
				if (result.kind !== 'ok') {
					throw new Error('Invalid artifact automation notice acknowledgement');
				}
			} finally {
				await transport.request({ kind: 'release', subscription }).catch(error => logService.error('[ArtifactIntegrations] Could not release notice subscription', error));
			}
		},
		acquireSession: async session => {
			await activateIntegrations?.();
			const reference = connection.getSubscription(StateComponents.Session, URI.parse(session), 'artifactIntegrations');
			const value = observableFromEvent(reference, Event.any(reference.object.onDidChange, reference.object.onDidError ?? Event.None), (): ArtifactSessionState => {
				const error = reference.object.value instanceof Error ? reference.object.value : undefined;
				const state = reference.object.verifiedValue;
				return {
					availability: error ? { kind: 'error', reason: error.message } : state ? { kind: 'available' } : { kind: 'loading' },
					archived: isSessionStatusArchived(state?.status),
					artifacts: readSessionArtifacts(state?._meta).flatMap(artifact => {
						const resource = artifact.link ?? artifact.uri;
						return resource ? [{ id: artifact.id, label: artifact.label, resource, isArtifact: artifact.isArtifact, origin: artifact.origin }] : [];
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

function subscriptionObservable<T>(subscription: IAgentSubscription<T>): IObservable<T | Error | undefined> {
	return observableFromEvent(subscription, Event.any(subscription.onDidChange, subscription.onDidError ?? Event.None),
		() => subscription.value instanceof Error ? subscription.value : subscription.verifiedValue);
}

class ClientArtifactIntegrationService extends ArtifactIntegrationService {
	constructor(runtime: IArtifactRuntime, storage: IArtifactIntegrationStorage, registry: IArtifactIntegrationRegistry, logService: ILogService, lifetime: DisposableStore) {
		super(runtime, storage, registry, logService);
		this._register(lifetime);
	}
}
