/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { constObservable, observableFromEvent } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { ArtifactIntegrationService } from '../../../artifactIntegrations/common/artifactIntegrationService.js';
import { ArtifactIntegrationRegistry } from '../../../artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactSessionState, IArtifactRuntime } from '../../../artifactIntegrations/common/artifactRuntime.js';
import { FileArtifactIntegrationStorage } from '../../../artifactIntegrations/node/artifactIntegrationStorage.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ArtifactChatAction, ArtifactChatEvent, ArtifactProtocolChatAccess } from '../../common/artifactIntegrationChat.js';
import { AgentHostArtifactToolsConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { readSessionArtifacts } from '../../common/sessionArtifacts.js';
import { isSessionStatusArchived } from '../../common/state/sessionState.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';

export const IAgentHostArtifactEventService = createDecorator<AgentHostArtifactEventService>('agentHostArtifactEventService');

export class AgentHostArtifactEventService extends Disposable {
	declare readonly _serviceBrand: undefined;
	private readonly emitter = this._register(new Emitter<ArtifactChatEvent>());
	readonly onDidChange = this.emitter.event;

	accept(event: ArtifactChatEvent): void {
		this.emitter.fire(event);
	}
}

export interface IAgentHostArtifactCallbacks {
	acquire(resource: URI, owner: string): Promise<IDisposable>;
	dispatch(chat: string, action: ArtifactChatAction): Promise<void>;
}

export class AgentHostArtifactRuntime extends Disposable {
	readonly integrations: ArtifactIntegrationService;

	constructor(
		resource: URI | undefined,
		callbacks: IAgentHostArtifactCallbacks,
		registry: ArtifactIntegrationRegistry,
		artifactEventService: AgentHostArtifactEventService,
		stateManager: AgentHostStateManager,
		configuration: IAgentConfigurationService,
		logService: ILogService,
	) {
		super();
		const available = observableFromEvent(this, configuration.onDidRootConfigChange, () => configuration.getRootValue(platformRootSchema, AgentHostArtifactToolsConfigKey) === true);
		const stateChanges = Event.any<unknown>(artifactEventService.onDidChange, stateManager.onDidRemoveSession, stateManager.onDidChangeSessionStatus);
		const chat = this._register(new ArtifactProtocolChatAccess({
			admission: 'bestEffort',
			available: constObservable(true),
			onDidAction: artifactEventService.onDidChange,
			acquireChat: async (_session, chat) => {
				const reference = await this.acquire(chat, callbacks, () => {
					const state = stateManager.getChatState(chat);
					return state ?? new Error(localize('artifactHostChatMissing', "The artifact's chat is unavailable; its prompt outcome cannot be confirmed."));
				});
				return {
					object: observableFromEvent(this, stateChanges, () => reference.object()),
					dispose: () => reference.dispose(),
				};
			},
			dispatch: (chat, action) => callbacks.dispatch(chat, action),
		}));
		const runtime: IArtifactRuntime = {
			authority: { id: resource ? `host:${createHash('sha256').update(resource.toString()).digest('hex')}` : `ephemeral:${generateUuid()}`, targetHost: 'self', location: 'host' },
			available,
			chat,
			isOwner: () => !this._store.isDisposed,
			acquireSession: async session => {
				const reference = await this.acquire(session, callbacks, (): ArtifactSessionState => {
					const state = stateManager.getSessionState(session);
					return {
						availability: state ? { kind: 'available' } : { kind: 'unavailable', reason: localize('artifactHostSessionMissing', "The artifact's session is unavailable.") },
						deleted: !state,
						archived: isSessionStatusArchived(state?.status),
						artifacts: readSessionArtifacts(state?._meta).flatMap(artifact => {
							const resource = artifact.link ?? artifact.uri;
							return resource ? [{ id: artifact.id, label: artifact.label, resource, origin: artifact.origin }] : [];
						}),
					};
				});
				return {
					object: observableFromEvent(this, stateChanges, () => reference.object()),
					dispose: () => reference.dispose(),
				};
			},
			authorize: async (_context, scope) => {
				if (!available.get()) {
					return { kind: 'blocked', reason: localize('artifactToolsDisabled', "Artifact integration execution is disabled on this host.") };
				}
				if (scope === 'resourceAndWorkspace') {
					return { kind: 'blocked', reason: localize('artifactWorkspaceExecutionUnavailable', "This runtime does not yet provide a workspace execution lease for artifact actions.") };
				}
				return { kind: 'allowed' };
			},
		};
		this.integrations = this._register(new ArtifactIntegrationService(runtime, new FileArtifactIntegrationStorage(resource), registry, logService));
	}

	private async acquire<T>(resource: string, callbacks: IAgentHostArtifactCallbacks, read: () => T): Promise<IReference<() => T>> {
		const uri = URI.parse(resource, true);
		const owner = `artifact-integrations:${generateUuid()}`;
		const lease = await callbacks.acquire(uri, owner);
		if (this._store.isDisposed) {
			lease.dispose();
			throw new Error('Artifact runtime is disposed');
		}
		return { object: read, dispose: () => lease.dispose() };
	}
}
