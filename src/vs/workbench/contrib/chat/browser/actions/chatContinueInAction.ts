/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { h } from '../../../../../base/browser/dom.js';
import { Disposable, IDisposable, markAsSingleton } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { isITextModel } from '../../../../../editor/common/model.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ActionWidgetDropdownActionViewItem } from '../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ResourceContextKey } from '../../../../common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatAgentService } from '../../common/chatAgents.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { ChatModel } from '../../common/chatModel.js';
import { ChatRequestParser } from '../../common/chatRequestParser.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionsExtensionPoint, IChatSessionsService } from '../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../common/constants.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { AgentSessionProviders, getAgentSessionProviderIcon, getAgentSessionProviderName } from '../agentSessions/agentSessions.js';
import { IChatWidgetService } from '../chat.js';
import { CHAT_SETUP_ACTION_ID } from './chatActions.js';
import { PromptFileVariableKind, toPromptFileVariableEntry } from '../../common/chatVariableEntries.js';
import { NEW_CHAT_SESSION_ACTION_ID } from '../chatSessions/common.js';

export const enum ActionLocation {
	ChatWidget = 'chatWidget',
	Editor = 'editor'
}

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
			menu: [{
				id: MenuId.ChatExecute,
				group: 'navigation',
				order: 3.4,
				when: ChatContextKeys.lockedToCodingAgent.negate(),
			},
			{
				id: MenuId.EditorContent,
				group: 'continueIn',
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled),
					ContextKeyExpr.equals(ResourceContextKey.LangId.key, PROMPT_LANGUAGE_ID),
					ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
				),
			}
			]
		});
	}

	override async run(): Promise<void> {
		// Handled by a custom action item
	}
}
export class ChatContinueInSessionActionItem extends ActionWidgetDropdownActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly location: ActionLocation,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IChatSessionsService chatSessionsService: IChatSessionsService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService
	) {
		super(action, {
			actionProvider: ChatContinueInSessionActionItem.actionProvider(chatSessionsService, instantiationService, location),
			actionBarActions: ChatContinueInSessionActionItem.getActionBarActions(openerService)
		}, actionWidgetService, keybindingService, contextKeyService);
	}

	protected static getActionBarActions(openerService: IOpenerService) {
		const learnMoreUrl = 'https://aka.ms/vscode-continue-chat-in';
		return [{
			id: 'workbench.action.chat.continueChatInSession.learnMore',
			label: localize('chat.learnMore', "Learn More"),
			tooltip: localize('chat.learnMore', "Learn More"),
			class: undefined,
			enabled: true,
			run: async () => {
				await openerService.open(URI.parse(learnMoreUrl));
			}
		}];
	}

	private static actionProvider(chatSessionsService: IChatSessionsService, instantiationService: IInstantiationService, location: ActionLocation): IActionWidgetDropdownActionProvider {
		return {
			getActions: () => {
				const actions: IActionWidgetDropdownAction[] = [];
				const contributions = chatSessionsService.getAllChatSessionContributions();

				// Continue in Background
				const backgroundContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Background);
				if (backgroundContrib && backgroundContrib.canDelegate !== false) {
					actions.push(this.toAction(AgentSessionProviders.Background, backgroundContrib, instantiationService, location));
				}

				// Continue in Cloud
				const cloudContrib = contributions.find(contrib => contrib.type === AgentSessionProviders.Cloud);
				if (cloudContrib && cloudContrib.canDelegate !== false) {
					actions.push(this.toAction(AgentSessionProviders.Cloud, cloudContrib, instantiationService, location));
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

	private static toAction(provider: AgentSessionProviders, contrib: IChatSessionsExtensionPoint, instantiationService: IInstantiationService, location: ActionLocation): IActionWidgetDropdownAction {
		return {
			id: contrib.type,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			description: `@${contrib.name}`,
			label: getAgentSessionProviderName(provider),
			tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			category: { label: localize('continueIn', "Continue In"), order: 0 },
			run: () => instantiationService.invokeFunction(accessor => {
				if (location === ActionLocation.Editor) {
					return new CreateRemoteAgentJobFromEditorAction().run(accessor, contrib);
				}
				return new CreateRemoteAgentJobAction().run(accessor, contrib);
			})
		};
	}

	private static toSetupAction(provider: AgentSessionProviders, instantiationService: IInstantiationService): IActionWidgetDropdownAction {
		return {
			id: provider,
			enabled: true,
			icon: getAgentSessionProviderIcon(provider),
			class: undefined,
			label: getAgentSessionProviderName(provider),
			tooltip: localize('continueSessionIn', "Continue in {0}", getAgentSessionProviderName(provider)),
			category: { label: localize('continueIn', "Continue In"), order: 0 },
			run: () => instantiationService.invokeFunction(accessor => {
				const commandService = accessor.get(ICommandService);
				return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
			})
		};
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		if (this.location === ActionLocation.Editor) {
			const view = h('span.action-widget-delegate-label', [
				h('span', { className: ThemeIcon.asClassName(Codicon.forward) }),
				h('span', [localize('continueInEllipsis', "Continue in...")])
			]);
			element.appendChild(view.root);
			return null;
		} else {
			const icon = this.contextKeyService.contextMatchesRules(ChatContextKeys.remoteJobCreating) ? Codicon.sync : Codicon.forward;
			element.classList.add(...ThemeIcon.asClassNameArray(icon));
			return super.renderLabel(element);
		}
	}
}

class CreateRemoteAgentJobAction {
	constructor() { }

	private openUntitledEditor(commandService: ICommandService, continuationTarget: IChatSessionsExtensionPoint) {
		commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
	}

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint) {
		const contextKeyService = accessor.get(IContextKeyService);
		const commandService = accessor.get(ICommandService);
		const widgetService = accessor.get(IChatWidgetService);
		const chatAgentService = accessor.get(IChatAgentService);
		const chatService = accessor.get(IChatService);
		const editorService = accessor.get(IEditorService);

		const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);

		try {
			remoteJobCreatingKey.set(true);

			const widget = widgetService.lastFocusedWidget;
			if (!widget || !widget.viewModel) {
				return this.openUntitledEditor(commandService, continuationTarget);
			}

			// todo@connor4312: remove 'as' cast
			const chatModel = widget.viewModel.model as ChatModel;
			if (!chatModel) {
				return;
			}

			const sessionResource = widget.viewModel.sessionResource;
			const chatRequests = chatModel.getRequests();
			let userPrompt = widget.getInput();
			if (!userPrompt) {
				if (!chatRequests.length) {
					return this.openUntitledEditor(commandService, continuationTarget);
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

			await chatService.removeRequest(sessionResource, addedRequest.id);
			const requestData = await chatService.sendRequest(sessionResource, userPrompt, {
				agentIdSilent: continuationTargetType,
				attachedContext: attachedContext.asArray(),
				userSelectedModelId: widget.input.currentLanguageModel,
				...widget.getModeRequestOptions()
			});

			if (requestData) {
				await widget.handleDelegationExitIfNeeded(defaultAgent, requestData.agent);
			}
		} catch (e) {
			console.error('Error creating remote coding agent job', e);
			throw e;
		} finally {
			remoteJobCreatingKey.set(false);
		}
	}
}

class CreateRemoteAgentJobFromEditorAction {
	constructor() { }

	async run(accessor: ServicesAccessor, continuationTarget: IChatSessionsExtensionPoint) {

		try {
			const editorService = accessor.get(IEditorService);
			const activeEditor = editorService.activeTextEditorControl;
			const commandService = accessor.get(ICommandService);

			if (!activeEditor) {
				return;
			}
			const model = activeEditor.getModel();
			if (!model || !isITextModel(model)) {
				return;
			}
			const uri = model.uri;
			const attachedContext = [toPromptFileVariableEntry(uri, PromptFileVariableKind.PromptFile, undefined, false, [])];
			const prompt = `Follow instructions in [${basename(uri)}](${uri.toString()}).`;
			await commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`, { prompt, attachedContext });
		} catch (e) {
			console.error('Error creating remote agent job from editor', e);
			throw e;
		}
	}
}

export class ContinueChatInSessionActionRendering extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.continueChatInSessionActionRendering';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const disposable = actionViewItemService.register(MenuId.EditorContent, ContinueChatInSessionAction.ID, (action, options, instantiationService2) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return instantiationService.createInstance(ChatContinueInSessionActionItem, action, ActionLocation.Editor);
		});
		markAsSingleton(disposable);
	}
}
