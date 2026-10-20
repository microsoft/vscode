/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { autorun, IObservable, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { AgentHostEditorUpdate, IAgentHostEditorState } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { AgentSessionStatus } from '../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../browser/agentSessions/agentSessionsService.js';
import { IChatService } from '../../common/chatService/chatService.js';
import { IChatSessionsService, isAgentHostTarget } from '../../common/chatSessionsService.js';
import { EditorChatUsage } from '../../common/editorChatUsage.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { getChatSessionType } from '../../common/model/chatUri.js';

export const IAgentHostEditorActivityService = createDecorator<IAgentHostEditorActivityService>('agentHostEditorActivityService');

export interface IAgentHostEditorActivityService {
	readonly _serviceBrand: undefined;
	readonly state: IObservable<IAgentHostEditorState | undefined>;
	recordCopilotHarnessIntroductionShown(): Promise<void>;
}

/** Publishes activity only for requests submitted by this editor, not shared catalog appearances. */
export class AgentHostEditorActivity extends Disposable implements IAgentHostEditorActivityService {
	declare readonly _serviceBrand: undefined;
	readonly state = observableValue<IAgentHostEditorState | undefined>(this, undefined);
	private readonly ready: Promise<void>;
	private readonly updates = new Sequencer();
	private pendingUpdate: Promise<void> = Promise.resolve();

	constructor(
		@IChatService chatService: IChatService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IAgentSessionsService agentSessionsService: IAgentSessionsService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		if (environmentService.isSessionsWindow) {
			this.ready = Promise.resolve();
			return;
		}
		this.ready = this.initialize(new EditorChatUsage(storageService).agentHostSessionCount);
		void this.ready.catch(error => logService.error('[AgentHostEditorActivity] Failed to initialize activity', error));
		this._register(nativeHostService.onDidChangeAgentHostEditorState(state => this.acceptState(state)));
		this._register(chatService.onDidAcceptRequest(event => {
			if (isAgentHostTarget(getChatSessionType(event.chatSessionResource))) {
				this.update({ kind: 'request', resource: event.chatSessionResource.toJSON(), isNewSession: event.isNewSession });
			}
		}));
		this._register(chatSessionsService.onDidCommitSession(event => {
			this.update({ kind: 'commit', original: event.original.toJSON(), committed: event.committed.toJSON() });
		}));
		this._register(chatService.onDidDisposeSession(event => {
			if (event.reason === 'cleared') {
				this.update({ kind: 'delete', resources: event.sessionResources.map(resource => resource.toJSON()) });
			}
		}));
		const sessionsChanged = observableSignalFromEvent(this, agentSessionsService.model.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const state = this.state.read(reader);
			const models = new ResourceMap<IChatModel>([...chatService.chatModels.read(reader)].map((model): [URI, IChatModel] => [model.sessionResource, model]));
			const ownedSessions = state?.sessions.filter(session => session.windowId === nativeHostService.windowId) ?? [];
			const sessions = ownedSessions.map(session => {
				const resource = URI.revive(session.resource);
				const model = models.get(resource);
				const item = agentSessionsService.model.getSession(resource);
				const needsInput = model ? !!model.requestNeedsInput.read(reader) : item?.status === AgentSessionStatus.NeedsInput;
				const inProgress = !needsInput && (model ? model.requestInProgress.read(reader) : item?.status === AgentSessionStatus.InProgress);
				return { resource: session.resource, inProgress, needsInput };
			});
			if (sessions.some((session, index) => session.inProgress !== ownedSessions[index].inProgress || session.needsInput !== ownedSessions[index].needsInput)) {
				this.update({ kind: 'sessions', sessions });
			}
		}));
		this._register(lifecycleService.onWillShutdown(event => event.join(this.pendingUpdate, {
			id: 'chat.agentHostEditorActivity',
			label: localize('savingAgentHostEditorActivity', "Saving Agent Host editor activity"),
		})));
	}

	recordCopilotHarnessIntroductionShown(): Promise<void> {
		return this.enqueue({ kind: 'copilotHarnessIntroductionShown' });
	}

	private async initialize(legacyCount: number): Promise<void> {
		this.acceptState(await this.nativeHostService.getAgentHostEditorState(legacyCount));
	}

	private acceptState(state: IAgentHostEditorState): void {
		if (!this._store.isDisposed && state.revision >= (this.state.get()?.revision ?? -1)) {
			this.state.set(state, undefined);
		}
	}

	private update(update: AgentHostEditorUpdate): void {
		void this.enqueue(update).catch(error => this.logService.error('[AgentHostEditorActivity] Failed to update activity', error));
	}

	private enqueue(update: AgentHostEditorUpdate): Promise<void> {
		this.pendingUpdate = this.updates.queue(async () => {
			await this.ready;
			await this.nativeHostService.updateAgentHostEditorState(update);
		});
		return this.pendingUpdate;
	}
}
