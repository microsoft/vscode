/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../../../base/common/map.js';
import * as nls from '../../../../../nls.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { IChatModel } from '../../common/chatModel.js';
import { IChatService, IChatToolInvocation } from '../../common/chatService.js';
import { ChatSessionStatus, IChatSessionItem, IChatSessionItemProvider, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService, isIChatViewViewContext } from '../chat.js';
import { ChatSessionItemWithProvider } from './common.js';

export class LocalChatSessionsProvider extends Disposable implements IChatSessionItemProvider, IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.localChatSessionsProvider';
	static readonly CHAT_WIDGET_VIEW_ID = 'workbench.panel.chat.view.copilot';
	readonly chatSessionType = localChatSessionType;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	readonly _onDidChangeChatSessionItems = this._register(new Emitter<void>());
	public get onDidChangeChatSessionItems() { return this._onDidChangeChatSessionItems.event; }

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IChatService private readonly chatService: IChatService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super();

		this._register(this.chatSessionsService.registerChatSessionItemProvider(this));

		this.registerWidgetListeners();

		this._register(this.chatService.onDidDisposeSession(() => {
			this._onDidChange.fire();
		}));

		// Listen for global session items changes for our session type
		this._register(this.chatSessionsService.onDidChangeSessionItems((sessionType) => {
			if (sessionType === this.chatSessionType) {
				this._onDidChange.fire();
			}
		}));
	}

	private registerWidgetListeners(): void {
		// Listen for new chat widgets being added/removed
		this._register(this.chatWidgetService.onDidAddWidget(widget => {
			// Only fire for chat view instance
			if (widget.location === ChatAgentLocation.Chat &&
				isIChatViewViewContext(widget.viewContext) &&
				widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID) {
				this._onDidChange.fire();
				this._registerWidgetModelListeners(widget);
			}
		}));

		// Check for existing chat widgets and register listeners
		const existingWidgets = this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)
			.filter(widget => isIChatViewViewContext(widget.viewContext) && widget.viewContext.viewId === LocalChatSessionsProvider.CHAT_WIDGET_VIEW_ID);

		existingWidgets.forEach(widget => {
			this._registerWidgetModelListeners(widget);
		});
	}

	private _registerWidgetModelListeners(widget: IChatWidget): void {
		const register = () => {
			this.registerModelTitleListener(widget);
			if (widget.viewModel) {
				this.chatSessionsService.registerModelProgressListener(widget.viewModel.model, () => {
					this._onDidChangeChatSessionItems.fire();
				});
			}
		};
		// Listen for view model changes on this widget
		this._register(widget.onDidChangeViewModel(() => {
			register();
			this._onDidChangeChatSessionItems.fire();
		}));

		register();
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

	private modelToStatus(model: IChatModel): ChatSessionStatus | undefined {
		if (model.requestInProgress.get()) {
			return ChatSessionStatus.InProgress;
		} else {
			const requests = model.getRequests();
			if (requests.length > 0) {
				// Check if the last request was completed successfully or failed
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
		}
		return;
	}

	async provideChatSessionItems(token: CancellationToken): Promise<IChatSessionItem[]> {
		const sessions: ChatSessionItemWithProvider[] = [];
		const sessionsByResource = new ResourceSet();
		this.chatService.getLiveSessionItems().forEach(sessionDetail => {
			let status: ChatSessionStatus | undefined;
			let startTime: number | undefined;
			let endTime: number | undefined;
			const model = this.chatService.getSession(sessionDetail.sessionResource);
			if (model) {
				status = this.modelToStatus(model);
				startTime = model.timestamp;

				const lastResponse = model.getRequests().at(-1)?.response;
				if (lastResponse) {
					endTime = lastResponse.completedAt ?? lastResponse.timestamp;
				}
			}
			const statistics = model ? this.getSessionStatistics(model) : undefined;
			const description = model ? this.getSessionDescription(model) : undefined;
			const editorSession: ChatSessionItemWithProvider = {
				resource: sessionDetail.sessionResource,
				label: sessionDetail.title,
				iconPath: Codicon.chatSparkle,
				status,
				description,
				provider: this,
				timing: {
					startTime: startTime ?? Date.now(), // TODO@osortega this is not so good
					endTime
				},
				statistics
			};
			sessionsByResource.add(sessionDetail.sessionResource);
			sessions.push(editorSession);
		});
		const history = await this.getHistoryItems();
		sessions.push(...history.filter(h => !sessionsByResource.has(h.resource)));

		return sessions;
	}

	private async getHistoryItems(): Promise<ChatSessionItemWithProvider[]> {
		try {
			const allHistory = await this.chatService.getHistorySessionItems();
			const historyItems = allHistory.map((historyDetail): ChatSessionItemWithProvider => {
				const model = this.chatService.getSession(historyDetail.sessionResource);
				const statistics = model ? this.getSessionStatistics(model) : undefined;
				return {
					resource: historyDetail.sessionResource,
					label: historyDetail.title,
					iconPath: Codicon.chatSparkle,
					provider: this,
					timing: {
						startTime: historyDetail.lastMessageDate ?? Date.now()
					},
					archived: true,
					statistics
				};
			});
			return historyItems;

		} catch (error) {
			return [];
		}
	}

	private getSessionStatistics(chatModel: IChatModel) {
		let linesAdded = 0;
		let linesRemoved = 0;
		const modifiedFiles = new ResourceSet();
		const currentEdits = chatModel.editingSession?.entries.get();
		if (currentEdits) {
			const uncommittedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
			uncommittedEdits.forEach(edit => {
				linesAdded += edit.linesAdded?.get() ?? 0;
				linesRemoved += edit.linesRemoved?.get() ?? 0;
				modifiedFiles.add(edit.modifiedURI);
			});
		}
		if (modifiedFiles.size === 0) {
			return;
		}
		return {
			files: modifiedFiles.size,
			insertions: linesAdded,
			deletions: linesRemoved,
		};
	}

	private extractFileNameFromLink(filePath: string): string {
		return filePath.replace(/\[.*?\]\(file:\/\/\/(?<path>[^)]+)\)/g, (_: string, __: string, ___: number, ____, groups?: { path?: string }) => {
			const fileName = groups?.path ? groups.path.split('/').pop() || groups.path : '';
			return fileName;
		});
	}

	private getSessionDescription(chatModel: IChatModel): string | undefined {
		const requests = chatModel.getRequests();
		if (requests.length === 0) {
			return ''; // signal Chat that has not started yet
		}

		// Get the last request to check its response status
		const lastRequest = requests[requests.length - 1];
		const response = lastRequest?.response;
		if (!response) {
			return ''; // signal Chat that has not started yet
		}

		// If the response is complete, show Finished
		if (response.isComplete) {
			return nls.localize('chat.sessions.description.finished', "Finished");
		}

		// Get the response parts to find tool invocations and progress messages
		const responseParts = response.response.value;
		let description: string = '';

		for (let i = responseParts.length - 1; i >= 0; i--) {
			const part = responseParts[i];
			if (!description && part.kind === 'toolInvocation') {
				const toolInvocation = part as IChatToolInvocation;
				const state = toolInvocation.state.get();

				if (state.type !== IChatToolInvocation.StateKind.Completed) {
					const pastTenseMessage = toolInvocation.pastTenseMessage;
					const invocationMessage = toolInvocation.invocationMessage;
					const message = pastTenseMessage || invocationMessage;
					description = typeof message === 'string' ? message : message?.value ?? '';

					if (description) {
						description = this.extractFileNameFromLink(description);
					}
					if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
						const message = toolInvocation.confirmationMessages?.title && (typeof toolInvocation.confirmationMessages.title === 'string'
							? toolInvocation.confirmationMessages.title
							: toolInvocation.confirmationMessages.title.value);
						description = message ?? `${nls.localize('chat.sessions.description.waitingForConfirmation', "Waiting for confirmation:")} ${description}`;
					}
				}
			}
		}

		return description || nls.localize('chat.sessions.description.working', "Working...");
	}
}
