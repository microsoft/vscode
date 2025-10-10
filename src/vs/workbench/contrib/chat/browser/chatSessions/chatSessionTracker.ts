/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { GroupModelChangeKind } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { ChatSessionItemWithProvider, getChatSessionType, isChatSession } from './common.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider } from '../../common/chatSessionsService.js';
import { IChatService } from '../../common/chatService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IChatModel } from '../../common/chatModel.js';
import { ChatSessionUri } from '../../common/chatUri.js';

export class ChatSessionTracker extends Disposable {
	private readonly _onDidChangeEditors = this._register(new Emitter<{ sessionType: string; kind: GroupModelChangeKind }>());
	readonly onDidChangeEditors = this._onDidChangeEditors.event;

	constructor(
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IChatService private readonly chatService: IChatService
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
	}

	private registerGroupListeners(group: IEditorGroup): void {
		this._register(group.onDidModelChange(e => {
			if (!isChatSession(e.editor)) {
				return;
			}

			const editor = e.editor as ChatEditorInput;
			const sessionType = getChatSessionType(editor);

			// Emit targeted event for this session type
			this._onDidChangeEditors.fire({ sessionType, kind: e.kind });
		}));
	}

	public getLocalEditorsForSessionType(sessionType: string): ChatEditorInput[] {
		const localEditors: ChatEditorInput[] = [];

		this.editorGroupsService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof ChatEditorInput && getChatSessionType(editor) === sessionType) {
					localEditors.push(editor);
				}
			});
		});

		return localEditors;
	}

	async getHybridSessionsForProvider(provider: IChatSessionItemProvider): Promise<IChatSessionItem[]> {
		if (provider.chatSessionType === 'local') {
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

			let status: ChatSessionStatus | undefined;
			let timestamp: number | undefined;

			if (editor.sessionId) {
				const model = this.chatService.getSession(editor.sessionId);
				if (model) {
					status = this.modelToStatus(model);
					const requests = model.getRequests();
					if (requests.length > 0) {
						timestamp = requests[requests.length - 1].timestamp;
					}
				}
			}

			const parsed = ChatSessionUri.parse(editor.resource);
			const hybridSession: ChatSessionItemWithProvider = {
				id: parsed?.sessionId || editor.sessionId || `${provider.chatSessionType}-local-${index}`,
				label: editor.getName(),
				iconPath: Codicon.chatSparkle,
				status,
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
