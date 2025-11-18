/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { basename, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatAgentService, IChatAgent, IChatAgentHistoryEntry } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatRequestModel, toChatHistoryContent } from '../../common/chatModel.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IChatService } from '../../common/chatService.js';
import { chatSessionResourceToId } from '../../common/chatUri.js';
import { ChatRequestVariableSet, isChatRequestFileEntry } from '../../common/chatVariableEntries.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { IChatWidgetService } from '../chat.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { CHAT_SETUP_ACTION_ID } from './chatActions.js';

export class ContinueChatInSessionAction extends Action2 {

	static readonly ID = 'workbench.action.chat.continueChatInSession';

	constructor() {
		super({
			id: ContinueChatInSessionAction.ID,
			title: localize2('continueChatInSession', "Continue Chat in..."),
			tooltip: localize('continueChatInSession', "Continue Chat in..."),
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ChatContextKeys.requestInProgress.negate(),
				ChatContextKeys.remoteJobCreating.negate(),
			),
			menu: {
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 3.4,
				when: ChatContextKeys.lockedToCodingAgent.negate(),
			}
		});
	}

	override async run(): Promise<void> {
		// Handled by a custom action item
	}
}

export class ChatContinueInSessionActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(action, {
			actionProvider: ChatContinueInSessionActionItem.actionProvider(chatSessionsService, instantiationService)
		}, actionWidgetService, keybindingService, contextKeyService);
	}

	private static actionProvider(chatSessionsService: IChatSessionsService, instantiationService: IInstantiationService): IActionWidgetDropdownActionProvider {
		return {
			getActions: () => {
				const actions: IActionWidgetDropdownAction[] = [];
				const contributions = chatSessionsService.getAllChatSessionContributions();

				// Continue in Background
				const backgroundContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Background);
				if (backgroundContrib && backgroundContrib.canDelegate !== false) {
					actions.push(this.toAction(AgentSessionProviders.Background, backgroundContrib, instantiationService));
				}

				// Continue in Cloud
				const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
				if (cloudContrib && cloudContrib.canDelegate !== false) {
					actions.push(this.toAction(AgentSessionProviders.Cloud, cloudContrib, instantiationService));
				}

				// Offer actions to enter setup if we have no contributions
				if (actions.length === 0) {
					actions.push(this.toSetupAction(AgentSessionProviders.Background, instantiationService));
					actions.push(this.toSetupAction(AgentSessionProviders.Cloud, instantiationService));
				}

				return actions;
			}
		};
	}

	private static toAction(provider: AgentSessionProviders, contrib: IChatSessionsExtensionPoint, instantiationService: IInstantiationService): IActionWidgetDropdownAction {
		return {
			id: contrib.type,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			description: `@${contrib.name}`,
			label: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			tooltip: contrib.displayName,
			run: () => instantiationService.invokeFunction(accessor => new CreateRemoteAgentJobAction().run(accessor, contrib))
		};
	}

	private static toSetupAction(provider: AgentSessionProviders, instantiationService: IInstantiationService): IActionWidgetDropdownAction {
		return {
			id: provider,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			label: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			run: () => instantiationService.invokeFunction(accessor => {
				const commandService = accessor.get(ICommandService);
				return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
			})
		};
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		const icon = this.contextKeyService.contextMatchesRules(ChatContextKeys.remoteJobCreating) ? Codicon.sync : Codicon.indent;
		element.classList.add(...ThemeIcon.asClassNameArray(icon));

		return super.renderLabel(element);
	}
}

class CreateRemoteAgentJobAction {

	private static readonly markdownStringTrustedOptions = {
		isTrusted: {
			enabledCommands: [] as string[],
		},
	};

	constructor() { }

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint) {
		const contextKeyService = accessor.get(IContextKeyService);
		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const widgetService = accessor.get(IChatWidgetService);
			const chatAgentService = accessor.get(IChatAgentService);
			const chatService = accessor.get(IChatService);
			const workspaceContextService = accessor.get(IWorkspaceContextService);
			const editorService = accessor.get(IEditorService);

			const widget = widgetService.lastFocusedWidget;
			if (!widget) {
				return;
			}
			if (!widget.viewModel) {
				return;
			}
			const chatModel = widget.viewModel.model;
			if (!chatModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					// Nothing to do
					return;
				}
				userPrompt = 'implement this.';
			}

			const attachedContext = widget.input.getAttachedAndImplicitContext(sessionResource);
			widget.input.acceptInput(true);

			// For inline editor mode, add selection or cursor information
			if (widget.location === ChatAgentLocation.EditorInline) {
				const activeEditor = editorService.activeTextEditorControl;
				if (activeEditor) {
					const model = activeEditor.getModel();
					let activeEditorUri: URI | undefined = undefined;
					if (model && isITextModel(model)) {
						activeEditorUri = model.uri as URI;
					}
					const selection = activeEditor.getSelection();
					if (activeEditorUri && selection) {
						attachedContext.add({
							kind: 'file',
							id: 'vscode.implicit.selection',
							name: basename(activeEditorUri),
							value: {
								uri: activeEditorUri,
								range: selection
							},
						});
					}
				}
			}

			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
			const instantiationService = accessor.get(IInstantiationService);
			const requestParser = instantiationService.createInstance(ChatRequestParser);
			const continuationTargetType = continuationTarget.type;

			// Add the request to the model first
			const parsedRequest = requestParser.parseChatRequest(sessionResource, userPrompt, ChatAgentLocation.Chat);
			const addedRequest = chatModel.addRequest(
				parsedRequest,
				{ variables: attachedContext.asArray() },
				0,
				undefined,
				defaultAgent
			);

			let title: string | undefined = undefined;

			// -- summarize userPrompt if necessary
			let summarizedUserPrompt: string | undefined = undefined;
			if (defaultAgent && userPrompt.length > 10_000) {
				chatModel.acceptResponseProgress(addedRequest, {
					kind: 'progressMessage',
					content: new MarkdownString(
						localize('summarizeUserPromptCreateRemoteJob', "Summarizing user prompt"),
						CreateRemoteAgentJobAction.markdownStringTrustedOptions,
					)
				});

				({ title, summarizedUserPrompt } = await this.generateSummarizedUserPrompt(sessionResource, userPrompt, attachedContext, title, chatAgentService, defaultAgent, summarizedUserPrompt));
			}

			let summary: string = '';

			// Add selection or cursor information to the summary
			attachedContext.asArray().forEach(ctx => {
				if (isChatRequestFileEntry(ctx) && ctx.value && isLocation(ctx.value)) {
					const range = ctx.value.range;
					const isSelection = range.startLineNumber !== range.endLineNumber || range.startColumn !== range.endColumn;

					// Get relative path for the file
					let filePath = ctx.name;
					const workspaceFolder = workspaceContextService.getWorkspaceFolder(ctx.value.uri);

					if (workspaceFolder && ctx.value.uri) {
						const relativePathResult = relativePath(workspaceFolder.uri, ctx.value.uri);
						if (relativePathResult) {
							filePath = relativePathResult;
						}
					}

					if (isSelection) {
						summary += `User has selected text in file ${filePath} from ${range.startLineNumber}:${range.startColumn} to ${range.endLineNumber}:${range.endColumn}\n`;
					} else {
						summary += `User is on file ${filePath} at position ${range.startLineNumber}:${range.startColumn}\n`;
					}
				}
			});

			// -- summarize context if necessary
			if (defaultAgent && chatRequests.length > 1) {
				chatModel.acceptResponseProgress(addedRequest, {
					kind: 'progressMessage',
					content: new MarkdownString(
						localize('analyzingChatHistory', "Analyzing chat history"),
						CreateRemoteAgentJobAction.markdownStringTrustedOptions
					)
				});
				({ title, summary } = await this.generateSummarizedChatHistory(chatRequests, sessionResource, title, chatAgentService, defaultAgent, summary));
			}

			if (title) {
				summary += `\nTITLE: ${title}\n`;
			}

			await chatService.removeRequest(sessionResource, addedRequest.id);
			await chatService.sendRequest(sessionResource, userPrompt, {
				agentIdSilent: continuationTargetType,
				attachedContext: attachedContext.asArray(),
				chatSummary: {
					prompt: summarizedUserPrompt,
					history: summary,
				},
			});
		} catch (e) {
			console.error('Error creating remote coding agent job', e);
			throw e;
		} finally {
			remoteJobCreatingKey.set(false);
		}
	}

	private async generateSummarizedChatHistory(chatRequests: IChatRequestModel[], sessionResource: URI, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summary: string) {
		const historyEntries: IChatAgentHistoryEntry[] = chatRequests
			.map((req): IChatAgentHistoryEntry => ({
				request: {
					sessionId: chatSessionResourceToId(sessionResource),
					sessionResource,
					requestId: req.id,
					agentId: req.response?.agent?.id ?? '',
					message: req.message.text,
					command: req.response?.slashCommand?.name,
					variables: req.variableData,
					location: ChatAgentLocation.Chat,
					editedFileEvents: req.editedFileEvents,
				},
				response: toChatHistoryContent(req.response!.response.value),
				result: req.response?.result ?? {}
			}));

		// TODO: Determine a cutoff point where we stop including earlier history
		//      For example, if the user has already delegated to a coding agent once,
		// 		 prefer the conversation afterwards.
		title ??= await chatAgentService.getChatTitle(defaultAgent.id, historyEntries, CancellationToken.None);
		summary += await chatAgentService.getChatSummary(defaultAgent.id, historyEntries, CancellationToken.None);
		return { title, summary };
	}

	private async generateSummarizedUserPrompt(sessionResource: URI, userPrompt: string, attachedContext: ChatRequestVariableSet, title: string | undefined, chatAgentService: IChatAgentService, defaultAgent: IChatAgent, summarizedUserPrompt: string | undefined) {
		const userPromptEntry: IChatAgentHistoryEntry = {
			request: {
				sessionId: chatSessionResourceToId(sessionResource),
				sessionResource,
				requestId: generateUuid(),
				agentId: '',
				message: userPrompt,
				command: undefined,
				variables: { variables: attachedContext.asArray() },
				location: ChatAgentLocation.Chat,
				editedFileEvents: [],
			},
			response: [],
			result: {}
		};
		const historyEntries = [userPromptEntry];
		title = await chatAgentService.getChatTitle(defaultAgent.id, historyEntries, CancellationToken.None);
		summarizedUserPrompt = await chatAgentService.getChatSummary(defaultAgent.id, historyEntries, CancellationToken.None);
		return { title, summarizedUserPrompt };
	}
}
