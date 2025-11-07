/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { LocalChatSessionUri } from '../../common/chatUri.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { ChatSessionItemWithProvider, isChatSession } from './common.js';

export class ChatSessionTracker extends Disposable {
	private readonly _onDidChangeEditors = this._register(new Emitter<{ sessionType: string; kind: GroupModelChangeKind }>());
	private readonly groupDisposables = this._register(new DisposableMap<number>());
	readonly onDidChangeEditors = this._onDidChangeEditors.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();
		this.setupEditorTracking();
	}

	private setupEditorTracking(): void {
		// Listen to all editor groups
		this.editorGroupsService.groups.forEach(group => {
			this.registerGroupListeners(group);
		});
		// Listen for new groups
		this._register(this.editorGroupsService.onDidAddGroup(group => {
			this.registerGroupListeners(group);
		}));
		// Listen for deleted groups
		this._register(this.editorGroupsService.onDidRemoveGroup(group => {
			this.groupDisposables.deleteAndDispose(group.id);
		}));
	}

	private registerGroupListeners(group: IEditorGroup): void {
		this.groupDisposables.set(group.id, group.onDidModelChange(e => {
			if (!isChatSession(this.chatSessionsService.getContentProviderSchemes(), e.editor)) {
				return;
			}

			const editor = e.editor as ChatEditorInput;
			const sessionType = editor.getSessionType();

			this.chatSessionsService.notifySessionItemsChanged(sessionType);

			// Emit targeted event for this session type
			this._onDidChangeEditors.fire({ sessionType, kind: e.kind });
		}));
	}

	public getLocalEditorsForSessionType(sessionType: string): ChatEditorInput[] {
		const localEditors: ChatEditorInput[] = [];

		this.editorGroupsService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof ChatEditorInput && editor.getSessionType() === sessionType) {
					localEditors.push(editor);
				}
			});
		});

		return localEditors;
	}

	async getHybridSessionsForProvider(provider: IChatSessionItemProvider): Promise<IChatSessionItem[]> {
		if (provider.chatSessionType === localChatSessionType) {
			return []; // Local provider doesn't need hybrid sessions
		}

		const localEditors = this.getLocalEditorsForSessionType(provider.chatSessionType);
		const hybridSessions: ChatSessionItemWithProvider[] = [];

		localEditors.forEach((editor, index) => {
			const group = this.findGroupForEditor(editor);
			if (!group) {
				return;
			}
			if (editor.options.ignoreInView) {
				return;
			}

			let status: ChatSessionStatus = ChatSessionStatus.Completed;
			let timestamp: number | undefined;

			if (editor.sessionResource) {
				const model = this.chatService.getSession(editor.sessionResource);
				const modelStatus = model ? this.modelToStatus(model) : undefined;
				if (model && modelStatus) {
					status = modelStatus;
					const requests = model.getRequests();
					if (requests.length > 0) {
						timestamp = requests[requests.length - 1].timestamp;
					}
				}
			}

			const parsed = LocalChatSessionUri.parse(editor.resource);
			const hybridSession: ChatSessionItemWithProvider = {
				id: parsed?.sessionId || editor.sessionId || `${provider.chatSessionType}-local-${index}`,
				resource: editor.resource,
				label: editor.getName(),
				status: status,
				provider,
				timing: {
					startTime: timestamp ?? Date.now()
				}
			};

			hybridSessions.push(hybridSession);
		});

		return hybridSessions;
	}

	private findGroupForEditor(editor: EditorInput): IEditorGroup | undefined {
		for (const group of this.editorGroupsService.groups) {
			if (group.editors.includes(editor)) {
				return group;
			}
		}
		return undefined;
	}

	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress) {
			return ChatSessionStatus.InProgress;
		}
		const requests = model.getRequests();
		if (requests.length > 0) {
			const lastRequest = requests[requests.length - 1];
			if (lastRequest?.response) {
				if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails) {
					return ChatSessionStatus.Failed;
				} else if (lastRequest.response.isComplete) {
					return ChatSessionStatus.Completed;
				} else {
					return ChatSessionStatus.InProgress;
				}
			}
		}
		return undefined;
	}
}
