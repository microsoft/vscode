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
import { IArtifactIntegrationRegistry } from '../../../artifactIntegrations/common/artifactIntegrationRegistry.js';
import { ArtifactSessionState, IArtifactRuntime } from '../../../artifactIntegrations/common/artifactRuntime.js';
import { FileArtifactIntegrationStorage } from '../../../artifactIntegrations/node/artifactIntegrationStorage.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { ArtifactChatAction, ArtifactChatEvent, ArtifactProtocolChatAccess } from '../../common/artifactIntegrationChat.js';
import { AgentHostArtifactIntegrationsConfigKey, platformRootSchema } from '../../common/agentHostSchema.js';
import { readSessionArtifacts } from '../../common/sessionArtifacts.js';
import { AgentHostArtifactNoticeMetaKey } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { isSessionStatusArchived, ResponsePartKind } from '../../common/state/sessionState.js';
import type { SystemNotificationResponsePart } from '../../common/state/protocol/state.js';
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
	postNotice(chat: string, part: SystemNotificationResponsePart & { readonly content: string }): void;
	/** Fires when a session's data is permanently deleted, as opposed to the session being unloaded. */
	readonly onDidDeleteSession?: Event<string>;
}

export class AgentHostArtifactRuntime extends Disposable {
	readonly integrations: ArtifactIntegrationService;

	constructor(
		resource: URI | undefined,
		callbacks: IAgentHostArtifactCallbacks,
		registry: IArtifactIntegrationRegistry,
		artifactEventService: AgentHostArtifactEventService,
		stateManager: AgentHostStateManager,
		configuration: IAgentConfigurationService,
		logService: ILogService,
	) {
		super();
		const enabled = observableFromEvent(this, configuration.onDidRootConfigChange, () => configuration.getRootValue(platformRootSchema, AgentHostArtifactIntegrationsConfigKey) === true);
		const stateChanges = Event.any<unknown>(artifactEventService.onDidChange, stateManager.onDidRemoveSession, stateManager.onDidChangeSessionStatus, stateManager.onDidChangeChatOwner);
		const chat = this._register(new ArtifactProtocolChatAccess({
			admission: 'bestEffort',
			available: constObservable(true),
			onDidAction: artifactEventService.onDidChange,
			acquireChat: async (session, chat) => {
				const reference = await this.acquire(chat, callbacks, () => {
					if (stateManager.getChatOwner(chat) !== session) {
						return new Error(localize('artifactHostChatMoved', "The artifact's chat no longer belongs to this session."));
					}
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
			available: constObservable(true),
			enabled,
			chat,
			postNotice: async notice => {
				const chat = notice.artifact.origin?.chat ?? stateManager.getSessionState(notice.session)?.defaultChat;
				if (!chat || stateManager.getChatOwner(chat) !== notice.session) {
					throw new Error(localize('artifactNoticeChatMissing', "The chat for this artifact automation notice is unavailable."));
				}
				const part: SystemNotificationResponsePart & { readonly content: string } = {
					kind: ResponsePartKind.SystemNotification,
					content: notice.content,
					_meta: { [AgentHostArtifactNoticeMetaKey]: { kind: notice.kind, iconId: notice.iconId } },
				};
				if (stateManager.getChatState(chat)) {
					callbacks.postNotice(chat, part);
					return;
				}
				const reference = await this.acquire(chat, callbacks, () => stateManager.getChatState(chat));
				try {
					if (!reference.object() || stateManager.getChatOwner(chat) !== notice.session) {
						throw new Error(localize('artifactNoticeChatMissing', "The chat for this artifact automation notice is unavailable."));
					}
					callbacks.postNotice(chat, part);
				} finally {
					reference.dispose();
				}
			},
			isOwner: () => !this._store.isDisposed,
			onDidDeleteSession: callbacks.onDidDeleteSession,
			acquireSession: async session => {
				const reference = await this.acquire(session, callbacks, (): ArtifactSessionState => {
					const state = stateManager.getSessionState(session);
					return {
						availability: state ? { kind: 'available' } : { kind: 'unavailable', reason: localize('artifactHostSessionMissing', "The artifact's session is unavailable.") },
						deleted: !state,
						archived: isSessionStatusArchived(state?.status),
						artifacts: readSessionArtifacts(state?._meta).flatMap(artifact => {
							const resource = artifact.link ?? artifact.uri;
							return resource ? [{ id: artifact.id, label: artifact.label, resource, isArtifact: artifact.isArtifact, origin: artifact.origin }] : [];
						}),
					};
				});
				return {
					object: observableFromEvent(this, stateChanges, () => reference.object()),
					dispose: () => reference.dispose(),
				};
			},
			authorize: async (_context, scope) => {
				if (!enabled.get()) {
					return { kind: 'blocked', reason: localize('artifactIntegrationsDisabled', "Artifact integrations are disabled on this host.") };
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
