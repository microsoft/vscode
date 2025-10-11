/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../base/common/observable.js';
import * as nls from '../../../../../nls.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService, IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItemProvider, IChatSessionsService, ChatSessionStatus, IChatSessionItem } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidgetService, IChatWidget } from '../chat.js';
import { ChatEditorInput } from '../chatEditorInput.js';
import { isChatSession, getChatSessionType, ChatSessionItemWithProvider } from './common.js';

export class LocalChatSessionsProvider extends Disposable implements IChatSessionItemProvider {
	static readonly CHAT_WIDGET_VIEW_ID = 'workbench.panel.chat.view.copilot';
	static readonly HISTORY_NODE_ID = 'show-history';
	readonly chatSessionType = 'local';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	public get onDidChangeChatSessionItems() { return this._onDidChangeChatSessionItems.event; }

	// Track the current editor set to detect actual new additions
	private currentEditorSet = new Set<string>();

	// Maintain ordered list of editor keys to preserve consistent ordering
	private editorOrder: string[] = [];

	constructor(
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this.initializeCurrentEditorSet();
		this.registerWidgetListeners();

		this._register(this.chatService.onDidDisposeSession(() => {
			this._onDidChange.fire();
		}));

		// Listen for global session items changes for our session type
		this._register(this.chatSessionsService.onDidChangeSessionItems((sessionType) => {
			if (sessionType === this.chatSessionType) {
				this.initializeCurrentEditorSet();
				this._onDidChange.fire();
			}
		}));
	}

	private registerWidgetListeners(): void {
		// Listen for new chat widgets being added/removed
		this._register(this.chatWidgetService.onDidAddWidget(widget => {
			// Only fire for chat view instance
			if (widget.location === ChatAgentLocation.Chat &&
				typeof widget.viewContext === 'object' &&
				'viewId' in widget.viewContext &&
				widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				this._onDidChange.fire();

				// Listen for view model changes on this widget
				this._register(widget.onDidChangeViewModel(() => {
					this._onDidChange.fire();
					if (widget.viewModel) {
						this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
					}
				}));

				// Listen for title changes on the current model
				this.registerModelTitleListener(widget);
				if (widget.viewModel) {
					this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
				}
			}
		}));

		// Check for existing chat widgets and register listeners
		const existingWidgets = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)
			.filter(widget => typeof widget.viewContext === 'object' && 'viewId' in widget.viewContext && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);

		existingWidgets.forEach(widget => {
			this._register(widget.onDidChangeViewModel(() => {
				this._onDidChange.fire();
				this.registerModelTitleListener(widget);
			}));

			// Register title listener for existing widget
			this.registerModelTitleListener(widget);
			if (widget.viewModel) {
				this.registerProgressListener(widget.viewModel.model.requestInProgressObs);
			}
		});
	}

	private registerProgressListener(observable: IObservable<boolean>) {
		const progressEvent = Event.fromObservableLight(observable);
		this._register(progressEvent(() => {
			this._onDidChangeChatSessionItems.fire();
		}));
	}

	private registerModelTitleListener(widget: IChatWidget): void {
		const model = widget.viewModel?.model;
		if (model) {
			// Listen for model changes, specifically for title changes via setCustomTitle
			this._register(model.onDidChange((e) => {
				// Fire change events for all title-related changes to refresh the tree
				if (!e || e.kind === 'setCustomTitle') {
					this._onDidChange.fire();
				}
			}));
		}
	}

	private initializeCurrentEditorSet(): void {
		this.currentEditorSet.clear();
		this.editorOrder = []; // Reset the order

		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (this.isLocalChatSession(editor)) {
					const key = this.getEditorKey(editor, group);
					this.currentEditorSet.add(key);
					this.editorOrder.push(key);
				}
			});
		});
	}

	private getEditorKey(editor: EditorInput, group: IEditorGroup): string {
		return `${group.id}-${editor.typeId}-${editor.resource?.toString() || editor.getName()}`;
	}

	private isLocalChatSession(editor?: EditorInput): boolean {
		// For the LocalChatSessionsProvider, we only want to track sessions that are actually 'local' type
		if (!isChatSession(editor)) {
			return false;
		}

		if (!(editor instanceof ChatEditorInput)) {
			return false;
		}

		const sessionType = getChatSessionType(editor);
		return sessionType === 'local';
	}

	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress) {
			return ChatSessionStatus.InProgress;
		} else {
			const requests = model.getRequests();
			if (requests.length > 0) {
				// Check if the last request was completed successfully or failed
				const lastRequest = requests[requests.length - 1];
				if (lastRequest && lastRequest.response) {
					if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails) {
						return ChatSessionStatus.Failed;
					} else if (lastRequest.response.isComplete) {
						return ChatSessionStatus.Completed;
					} else {
						return ChatSessionStatus.InProgress;
					}
				}
			}
		}
		return;
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: ChatSessionItemWithProvider[] = [];
		// Create a map to quickly find editors by their key
		const editorMap = new Map<string, { editor: EditorInput; group: IEditorGroup }>();

		this.editorGroupService.groups.forEach(group => {
			group.editors.forEach(editor => {
				if (editor instanceof ChatEditorInput) {
					const key = this.getEditorKey(editor, group);
					editorMap.set(key, { editor, group });
				}
			});
		});

		// Add chat view instance
		const chatWidget = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)
			.find(widget => typeof widget.viewContext === 'object' && 'viewId' in widget.viewContext && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);
		const status = chatWidget?.viewModel?.model ? this.modelToStatus(chatWidget.viewModel.model) : undefined;
		const widgetSession: ChatSessionItemWithProvider = {
			id: LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID,
			label: chatWidget?.viewModel?.model.title || nls.localize2('chat.sessions.chatView', "Chat").value,
			description: nls.localize('chat.sessions.chatView.description', "Chat View"),
			iconPath: Codicon.chatSparkle,
			status,
			provider: this
		};
		sessions.push(widgetSession);

		// Build editor-based sessions in the order specified by editorOrder
		this.editorOrder.forEach((editorKey, index) => {
			const editorInfo = editorMap.get(editorKey);
			if (editorInfo) {
				// Determine status and timestamp for editor-based session
				let status: ChatSessionStatus | undefined;
				let timestamp: number | undefined;
				if (editorInfo.editor instanceof ChatEditorInput && editorInfo.editor.sessionId) {
					const model = this.chatService.getSession(editorInfo.editor.sessionId);
					if (model) {
						status = this.modelToStatus(model);
						// Get the last interaction timestamp from the model
						const requests = model.getRequests();
						if (requests.length > 0) {
							const lastRequest = requests[requests.length - 1];
							timestamp = lastRequest.timestamp;
						} else {
							// Fallback to current time if no requests yet
							timestamp = Date.now();
						}
					}
					const editorSession: ChatSessionItemWithProvider = {
						id: editorInfo.editor.sessionId,
						label: editorInfo.editor.getName(),
						iconPath: Codicon.chatSparkle,
						status,
						provider: this,
						timing: {
							startTime: timestamp ?? 0
						}
					};
					sessions.push(editorSession);
				}
			}
		});

		const historyNode: IChatSessionItem = {
			id: LocalChatSessionsProvider.HISTORY_NODE_ID,
			label: nls.localize('chat.sessions.showHistory', "History"),
		};

		// Add "Show history..." node at the end
		return [...sessions, historyNode];
	}
}
