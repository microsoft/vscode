/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IChatRequestSubmittedEvent, IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatModel, IChatRequestModel } from '../../common/model/chatModel.js';
import { createChatRequestHistoryChatMatcher, IChatRequestHistoryService } from '../../common/requestHistory/chatRequestHistory.js';
import { resolveAgentHostChatLink } from '../agentSessions/agentHost/agentHostChatLink.js';
import { IAgentHostUntitledProvisionalSessionService } from '../agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';

/**
 * Records the requests the user sends to an Agent Host from this window in the {@link IChatRequestHistoryService}, keeps
 * their chat's title current while the chat is open, and forgets the requests of chats this window deletes.
 *
 * Every sessions provider sends through {@link IChatService.sendRequest}, whose request model exists by the time
 * {@link IChatService.onDidSubmitRequest} fires; an Agent Host turn is identified by its request's ID.
 */
export class ChatRequestHistoryRecorder extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatRequestHistoryRecorder';

	/** Follows the title of each chat a request was recorded in, by chat resource. */
	private readonly _titleWatchers = this._register(new DisposableMap<string>());

	constructor(
		@IChatService private readonly _chatService: IChatService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IChatRequestHistoryService private readonly _history: IChatRequestHistoryService,
		@IAgentHostConnectionsService private readonly _connectionsService: IAgentHostConnectionsService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalService: IAgentHostUntitledProvisionalSessionService,
		@ILabelService private readonly _labelService: ILabelService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._chatService.onDidSubmitRequest(e => this._onDidSubmitRequest(e)));
		this._register(this._chatService.onDidDisposeSession(({ sessionResources, reason }) => {
			for (const resource of sessionResources) {
				this._titleWatchers.deleteAndDispose(resource.toString());
				if (reason === 'cleared') {
					this._forget(resource);
				}
			}
		}));
		this._register(chatSessionsService.onDidDeleteChatSessionItem(resource => this._forget(resource)));
	}

	/** Forgets the requests of the deleted chat `resource`, or of every chat of the deleted session `resource`. */
	private _forget(resource: URI): void {
		this._history.remove(createChatRequestHistoryChatMatcher(resource, resource.fragment ? 'chat' : 'session', this._connectionsService, this._environmentService.remoteAuthority));
	}

	private _onDidSubmitRequest(e: IChatRequestSubmittedEvent): void {
		if (!this._history.enabled.get()) {
			return;
		}
		const model = this._chatService.getSession(e.chatSessionResource);
		const request = model?.lastRequest;
		if (!model || !request || request.message.text !== e.message?.text || !isUserRequest(request)) {
			return;
		}
		const prompt = request.message.text.trim();
		if (!prompt) {
			return;
		}
		void this._record(model, request, prompt).catch(error => this._logService.warn(`[ChatRequestHistory] Could not record a request: ${toErrorMessage(error)}`));
	}

	private async _record(model: IChatModel, request: IChatRequestModel, prompt: string): Promise<void> {
		const chatResource = model.sessionResource;
		const resolution = await resolveAgentHostChatLink(chatResource, request.id, this._connectionsService, this._provisionalService);
		if (resolution.kind !== 'link') {
			return;
		}
		// The window's own agent host runs where the window is connected, which for a remote window is not this machine.
		const remoteAuthority = resolution.connectionAuthority === AMBIENT_AGENT_HOST_AUTHORITY ? this._environmentService.remoteAuthority : undefined;
		const host = remoteAuthority
			? this._labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority) || remoteAuthority
			: this._connectionsService.connections.find(connection => connection.authority === resolution.connectionAuthority)?.name;
		this._history.record({
			prompt,
			timestamp: request.timestamp,
			link: resolution.link,
			chatResource: chatResource.toString(),
			...(model.title ? { title: model.title } : {}),
			...(host ? { host } : {}),
			...(remoteAuthority ? { remoteAuthority } : {}),
		});
		this._watchTitle(model);
	}

	private _watchTitle(model: IChatModel): void {
		const key = model.sessionResource.toString();
		if (this._titleWatchers.has(key)) {
			return;
		}
		const store = new DisposableStore();
		store.add(model.onDidChange(e => {
			if (e.kind === 'setCustomTitle' && e.title) {
				const title = e.title;
				this._history.update(entry => entry.chatResource === key && entry.title !== title ? { title } : undefined);
			}
		}));
		store.add(model.onDidDispose(() => this._titleWatchers.deleteAndDispose(key)));
		this._titleWatchers.set(key, store);
	}
}

/** Whether the user sent `request`, rather than the system, a tool or another agent. */
function isUserRequest(request: IChatRequestModel): boolean {
	return !request.isSystemInitiated && !request.isHiddenFromTranscript && !request.isRequestHiddenFromTranscript && !request.origin;
}
