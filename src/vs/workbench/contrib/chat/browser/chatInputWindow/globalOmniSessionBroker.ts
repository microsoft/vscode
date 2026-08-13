/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { BroadcastDataChannel } from '../../../../../base/browser/broadcast.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { raceCancellation, RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IUserDataProfileService } from '../../../../services/userDataProfile/common/userDataProfile.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { ChatRequestQueueKind, ChatSendResult, IChatSendRequestOptions, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IAdditionalRoutableSession, IChatSessionRoutingDispatchResult, IGlobalOmniSessionBroker, OmniChatEnabledSettingId } from '../../common/sessionRouter.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { AgentSessionStatus, IAgentSession } from '../agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { decodeGlobalOmniSessionCandidateId, IGlobalOmniSessionSnapshotEntry } from './globalOmniSessionBrokerModel.js';
import { GlobalOmniSessionBrokerClient, GlobalOmniSessionBrokerMessage } from './globalOmniSessionBrokerClient.js';

const GLOBAL_OMNI_SESSION_CHANNEL_PREFIX = 'chat-global-omni-sessions';
const SNAPSHOT_DEBOUNCE = 100;

function statusToString(status: AgentSessionStatus): string {
	switch (status) {
		case AgentSessionStatus.Failed: return 'failed';
		case AgentSessionStatus.Completed: return 'idle';
		case AgentSessionStatus.InProgress: return 'working';
		default: return 'unknown';
	}
}

function markdownToText(value: string | IMarkdownString | undefined): string | undefined {
	if (!value) {
		return undefined;
	}
	const text = (typeof value === 'string' ? value : value.value).trim();
	return text || undefined;
}

function isCopilotRoutingProvider(provider: string): boolean {
	return provider === AgentSessionProviders.Background
		|| provider === AgentSessionProviders.Cloud
		|| provider === AgentSessionProviders.AgentHostCopilot;
}

export class GlobalOmniSessionBrokerService extends Disposable implements IGlobalOmniSessionBroker {

	declare readonly _serviceBrand: undefined;

	private readonly _client = this._register(new MutableDisposable<GlobalOmniSessionBrokerClient>());
	private readonly _snapshotScheduler = this._register(new RunOnceScheduler(() => this._publishSnapshot(), SNAPSHOT_DEBOUNCE));
	private readonly _sourceId = `${mainWindow.vscodeWindowId}:${generateUuid()}`;
	private _profileId: string | undefined;
	private _enablementGeneration = 0;
	private _modelListenerRegistered = false;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatService private readonly chatService: IChatService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(OmniChatEnabledSettingId)) {
				void this._updateEnablement();
			}
		}));
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(event => {
			event.join(this._updateEnablement());
		}));
		this._register(dom.addDisposableListener(mainWindow, 'beforeunload', () => this._client.clear()));
		void this._updateEnablement();
	}

	getAdditionalCandidates(localSessionResources: readonly string[]): readonly IAdditionalRoutableSession[] {
		return this._client.value?.getAdditionalCandidates(localSessionResources) ?? [];
	}

	dispatch(
		candidateId: string,
		message: string,
		options: IChatSendRequestOptions,
		token: CancellationToken,
	): Promise<IChatSessionRoutingDispatchResult | undefined> {
		const client = this._client.value;
		if (client) {
			return client.dispatch(candidateId, message, options, token);
		}
		return Promise.resolve(decodeGlobalOmniSessionCandidateId(candidateId) ? {
			status: 'rejected',
			reason: 'Global Omni session routing is unavailable.',
			reasonCode: 'providerRemoved',
		} : undefined);
	}

	private async _updateEnablement(): Promise<void> {
		const generation = ++this._enablementGeneration;
		if (this.configurationService.getValue<boolean>(OmniChatEnabledSettingId) !== true) {
			this._profileId = undefined;
			this._client.clear();
			return;
		}

		const profileId = this.userDataProfileService.currentProfile.id;
		if (!this._client.value || this._profileId !== profileId) {
			this._profileId = profileId;
			this._client.value = new GlobalOmniSessionBrokerClient(
				profileId,
				this._sourceId,
				new BroadcastDataChannel<GlobalOmniSessionBrokerMessage>(`${GLOBAL_OMNI_SESSION_CHANNEL_PREFIX}.${encodeURIComponent(profileId)}`),
				(resource, message, options, token) => this._sendRequest(resource, message, options, token),
				error => this.logService.warn('[globalOmniSessionBroker] broker operation failed:', error),
			);
		}

		const model = this.agentSessionsService.model;
		if (!this._modelListenerRegistered) {
			this._modelListenerRegistered = true;
			this._register(model.onDidChangeSessions(() => this._snapshotScheduler.schedule()));
		}
		this._publishSnapshot();
		try {
			await model.resolve(undefined);
		} catch (error) {
			this.logService.warn('[globalOmniSessionBroker] resolving agent sessions failed:', error);
		}
		if (generation === this._enablementGeneration && this._profileId === profileId) {
			this._publishSnapshot();
		}
	}

	private _publishSnapshot(): void {
		const client = this._client.value;
		if (!client || this.configurationService.getValue<boolean>(OmniChatEnabledSettingId) !== true) {
			return;
		}
		client.updateLocalSnapshot(this.agentSessionsService.model.sessions
			.filter(session => this._isEligibleSession(session))
			.map(session => this._toSnapshotEntry(session)));
	}

	private _isEligibleSession(session: IAgentSession): boolean {
		return isCopilotRoutingProvider(session.providerType)
			&& !session.isArchived()
			&& this.chatSessionsService.getChatSessionContribution(getChatSessionType(session.resource))?.isReadOnly !== true;
	}

	private _toSnapshotEntry(session: IAgentSession): IGlobalOmniSessionSnapshotEntry {
		return {
			resource: session.resource.toString(),
			label: session.label,
			status: statusToString(session.status),
			created: session.timing?.created,
			lastActivity: session.timing?.lastRequestEnded ?? session.timing?.lastRequestStarted ?? session.timing?.created,
			description: markdownToText(session.description),
			repo: session.metadata?.repositoryPath,
			cwd: session.metadata?.workingDirectoryPath,
		};
	}

	private async _sendRequest(
		resource: URI,
		message: string,
		options: IChatSendRequestOptions,
		token: CancellationToken,
	): Promise<IChatSessionRoutingDispatchResult> {
		const session = this.agentSessionsService.getSession(resource);
		if (!session || !this._isEligibleSession(session)) {
			return {
				status: 'rejected',
				resource,
				reason: 'The source session is no longer available.',
				reasonCode: 'providerRemoved',
			};
		}

		const reference = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, 'globalOmniRoute');
		if (!reference) {
			return {
				status: 'rejected',
				resource,
				reason: 'The source session could not be loaded.',
				reasonCode: 'providerRemoved',
			};
		}
		if (token.isCancellationRequested) {
			reference.dispose();
			return {
				status: 'rejected',
				resource,
				reason: 'The routed request was cancelled.',
				reasonCode: 'cancelled',
			};
		}

		let disposeReference = true;
		try {
			const result = await this.chatService.sendRequest(resource, message, {
				...options,
				userSelectedModelId: undefined,
				agentIdSilent: getChatSessionType(resource),
				queue: ChatRequestQueueKind.Queued,
			});
			if (token.isCancellationRequested) {
				return {
					status: 'rejected',
					resource,
					reason: 'The routed request was cancelled.',
					reasonCode: 'cancelled',
				};
			}
			if (result.kind === 'rejected') {
				return {
					status: 'rejected',
					resource: result.newSessionResource ?? resource,
					reason: result.reason,
					reasonCode: result.reasonCode,
				};
			}
			if (result.kind === 'queued') {
				disposeReference = false;
				return {
					status: 'queued',
					resource,
					requestId: result.requestId,
					completion: this._resolveQueuedCompletion(resource, result.deferred)
						.finally(() => reference.dispose()),
				};
			}
			const response = await raceCancellation(result.data.responseCreatedPromise, token);
			if (!response) {
				return {
					status: 'rejected',
					resource,
					reason: 'The routed request was cancelled.',
					reasonCode: 'cancelled',
				};
			}
			return {
				status: 'sent',
				resource: result.newSessionResource ?? resource,
				requestId: response.requestId,
			};
		} finally {
			if (disposeReference) {
				reference.dispose();
			}
		}
	}

	private async _resolveQueuedCompletion(resource: URI, deferred: Promise<ChatSendResult>): Promise<IChatSessionRoutingDispatchResult> {
		try {
			let result = await deferred;
			while (result.kind === 'queued') {
				result = await result.deferred;
			}
			return result.kind === 'sent'
				? { status: 'sent', resource: result.newSessionResource ?? resource }
				: {
					status: 'rejected',
					resource: result.newSessionResource ?? resource,
					reason: result.reason,
					reasonCode: result.reasonCode,
				};
		} catch (error) {
			this.logService.warn('[globalOmniSessionBroker] queued request failed:', error);
			return {
				status: 'rejected',
				resource,
				reason: error instanceof Error ? error.message : String(error),
			};
		}
	}
}

registerSingleton(IGlobalOmniSessionBroker, GlobalOmniSessionBrokerService, InstantiationType.Delayed);
