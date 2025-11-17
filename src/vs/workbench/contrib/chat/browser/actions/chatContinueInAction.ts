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
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { AgentSessionProviders } from '../agentSessions/agentSessions.js';
import { localize, localize2 } from '../../../../../nls.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { basename, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IRemoteCodingAgent, IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { IChatAgentService, IChatAgent, IChatAgentHistoryEntry } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatModel, IChatRequestModel, toChatHistoryContent } from '../../common/chatModel.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IChatService, IChatPullRequestContent } from '../../common/chatService.js';
import { chatSessionResourceToId } from '../../common/chatUri.js';
import { ChatRequestVariableSet, isChatRequestFileEntry } from '../../common/chatVariableEntries.js';
import { ChatAgentLocation, ChatConfiguration } from '../../common/constants.js';
import { IChatWidget, IChatWidgetService } from '../chat.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';

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
				when: ContextKeyExpr.and(
					ContextKeyExpr.or(
						ChatContextKeys.hasRemoteCodingAgent,
						ChatContextKeys.hasCloudButtonV2
					),
					ChatContextKeys.lockedToCodingAgent.negate(),
				),
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
					actions.push(this.toAction(backgroundContrib, instantiationService));
				}

				// Continue in Cloud
				const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
				if (cloudContrib && cloudContrib.canDelegate !== false) {
					actions.push(this.toAction(cloudContrib, instantiationService));
				}

				return actions;
			}
		};
	}

	private static toAction(contrib: IChatSessionsExtensionPoint, instantiationService: IInstantiationService): IActionWidgetDropdownAction {
		return {
			id: contrib.type,
			enabled: true,
			icon: contrib.type === AgentSessionProviders.Cloud ? Codicon.cloud : Codicon.collection,
			class: undefined,
			tooltip: contrib.displayName,
			label: contrib.type === AgentSessionProviders.Cloud ?
				localize('continueInCloud', "Continue in Cloud") :
				localize('continueInBackground', "Continue in Background"),
			run: () => instantiationService.invokeFunction(accessor => new CreateRemoteAgentJobAction().run(accessor, contrib))
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

	private async pickCodingAgent<T extends IChatSessionsExtensionPoint | IRemoteCodingAgent>(
		quickPickService: IQuickInputService,
		options: T[]
	): Promise<T | undefined> {
		if (options.length === 0) {
			return undefined;
		}
		if (options.length === 1) {
			return options[0];
		}
		const pick = await quickPickService.pick(
			options.map(a => ({
				label: a.displayName,
				description: a.description,
				agent: a,
			})),
			{
				placeHolder: localize('selectBackgroundAgent', "Select Agent to delegate the task to"),
			}
		);
		if (!pick) {
			return undefined;
		}
		return pick.agent;
	}

	private async createWithChatSessions(
		targetAgentId: string,
		chatService: IChatService,
		sessionResource: URI,
		attachedContext: ChatRequestVariableSet,
		userPrompt: string,
		chatSummary?: {
			prompt?: string;
			history?: string;
		}
	) {
		await chatService.sendRequest(sessionResource, userPrompt, {
			agentIdSilent: targetAgentId,
			attachedContext: attachedContext.asArray(),
			chatSummary,
		});
	}

	private async createWithLegacy(
		remoteCodingAgentService: IRemoteCodingAgentsService,
		commandService: ICommandService,
		quickPickService: IQuickInputService,
		chatModel: IChatModel,
		addedRequest: IChatRequestModel,
		widget: IChatWidget,
		userPrompt: string,
		summary?: string,
	) {
		const agents = remoteCodingAgentService.getAvailableAgents();
		const agent = await this.pickCodingAgent(quickPickService, agents);
		if (!agent) {
			chatModel.completeResponse(addedRequest);
			return;
		}

		// Execute the remote command
		const result: Omit<IChatPullRequestContent, 'kind'> | string | undefined = await commandService.executeCommand(agent.command, {
			userPrompt,
			summary,
			_version: 2, // Signal that we support the new response format
		});

		if (result && typeof result === 'object') { /* _version === 2 */
			chatModel.acceptResponseProgress(addedRequest, { kind: 'pullRequest', ...result });
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent', content: new MarkdownString(
					localize('remoteAgentResponse2', "Your work will be continued in this pull request."),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
		} else if (typeof result === 'string') {
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent',
				content: new MarkdownString(
					localize('remoteAgentResponse', "Coding agent response: {0}", result),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
			// Extension will open up the pull request in another view
			widget.clear();
		} else {
			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'markdownContent',
				content: new MarkdownString(
					localize('remoteAgentError', "Coding agent session cancelled."),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});
		}
	}
	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint) {
		const contextKeyService = accessor.get(IContextKeyService);
		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const configurationService = accessor.get(IConfigurationService);
			const widgetService = accessor.get(IChatWidgetService);
			const chatAgentService = accessor.get(IChatAgentService);
			const chatService = accessor.get(IChatService);
			const commandService = accessor.get(ICommandService);
			const quickPickService = accessor.get(IQuickInputService);
			const remoteCodingAgentService = accessor.get(IRemoteCodingAgentsService);
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


			const isChatSessionsExperimentEnabled = configurationService.getValue<boolean>(ChatConfiguration.UseCloudButtonV2);
			if (isChatSessionsExperimentEnabled) {
				await chatService.removeRequest(sessionResource, addedRequest.id);
				return await this.createWithChatSessions(
					continuationTargetType,
					chatService,
					sessionResource,
					attachedContext,
					userPrompt,
					{
						prompt: summarizedUserPrompt,
						history: summary,
					},
				);
			}

			// -- Below is the legacy implementation

			chatModel.acceptResponseProgress(addedRequest, {
				kind: 'progressMessage',
				content: new MarkdownString(
					localize('creatingRemoteJob', "Delegating to coding agent"),
					CreateRemoteAgentJobAction.markdownStringTrustedOptions
				)
			});

			await this.createWithLegacy(remoteCodingAgentService, commandService, quickPickService, chatModel, addedRequest, widget, summarizedUserPrompt || userPrompt, summary);
			chatModel.setResponse(addedRequest, {});
			chatModel.completeResponse(addedRequest);
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
