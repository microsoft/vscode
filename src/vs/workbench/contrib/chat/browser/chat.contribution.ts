/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMarkdownString, MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { alertFocusChange } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { registerChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { ACTION_ID_NEW_CHAT, registerNewChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatClearActions';
import { registerChatCodeBlockActions } from 'vs/workbench/contrib/chat/browser/actions/chatCodeblockActions';
import { registerChatCopyActions } from 'vs/workbench/contrib/chat/browser/actions/chatCopyActions';
import { IChatExecuteActionContext, SubmitAction, registerChatExecuteActions } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { registerChatFileTreeActions } from 'vs/workbench/contrib/chat/browser/actions/chatFileTreeActions';
import { registerChatExportActions } from 'vs/workbench/contrib/chat/browser/actions/chatImportExport';
import { registerMoveActions } from 'vs/workbench/contrib/chat/browser/actions/chatMoveActions';
import { registerQuickChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { registerChatTitleActions } from 'vs/workbench/contrib/chat/browser/actions/chatTitleActions';
import { IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatWidget, IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chatAccessibilityService';
import { ChatContributionService } from 'vs/workbench/contrib/chat/browser/chatContributionServiceImpl';
import { ChatEditor, IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput, ChatEditorInputSerializer } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { QuickChatService } from 'vs/workbench/contrib/chat/browser/chatQuick';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/browser/chatVariables';
import { ChatWidgetService } from 'vs/workbench/contrib/chat/browser/chatWidget';
import 'vs/workbench/contrib/chat/browser/contrib/chatHistoryVariables';
import 'vs/workbench/contrib/chat/browser/contrib/chatInputEditorContrib';
import { ChatAgentLocation, ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { ChatWelcomeMessageModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { ILanguageModelsService, LanguageModelsService } from 'vs/workbench/contrib/chat/common/languageModels';
import { IVoiceChatService, VoiceChatService } from 'vs/workbench/contrib/chat/common/voiceChat';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/chatColors';
import { ChatCodeBlockContextProviderService } from 'vs/workbench/contrib/chat/browser/codeBlockContextProviderService';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		'chat.editor.fontSize': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in chat codeblocks."),
			default: isMacintosh ? 12 : 14,
		},
		'chat.editor.fontFamily': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.fontWeight': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.wordWrap': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.wordWrap', "Controls whether lines should wrap in chat codeblocks."),
			default: 'off',
			enum: ['on', 'off']
		},
		'chat.editor.lineHeight': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
			default: 0
		},
		'chat.experimental.implicitContext': {
			type: 'boolean',
			description: nls.localize('chat.experimental.implicitContext', "Controls whether a checkbox is shown to allow the user to determine which implicit context is included with a chat participant's prompt."),
			default: false
		},
	}
});


Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		ChatEditorInput.EditorID,
		nls.localize('chat', "Chat")
	),
	[
		new SyncDescriptor(ChatEditorInput)
	]
);

class ChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeChatSesssion}:**/**`,
			{
				id: ChatEditorInput.EditorID,
				label: nls.localize('chat', "Chat"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeChatSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(ChatEditorInput, resource, options as IChatEditorOptions), options };
				}
			}
		));
	}
}

class ChatAccessibleViewContribution extends Disposable {
	static ID: 'chatAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(100, 'panelChat', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const widgetService = accessor.get(IChatWidgetService);
			const codeEditorService = accessor.get(ICodeEditorService);
			return renderAccessibleView(accessibleViewService, widgetService, codeEditorService, true);
			function renderAccessibleView(accessibleViewService: IAccessibleViewService, widgetService: IChatWidgetService, codeEditorService: ICodeEditorService, initialRender?: boolean): boolean {
				const widget = widgetService.lastFocusedWidget;
				if (!widget) {
					return false;
				}
				const chatInputFocused = initialRender && !!codeEditorService.getFocusedCodeEditor();
				if (initialRender && chatInputFocused) {
					widget.focusLastMessage();
				}

				if (!widget) {
					return false;
				}

				const verifiedWidget: IChatWidget = widget;
				const focusedItem = verifiedWidget.getFocus();

				if (!focusedItem) {
					return false;
				}

				widget.focus(focusedItem);
				const isWelcome = focusedItem instanceof ChatWelcomeMessageModel;
				let responseContent = isResponseVM(focusedItem) ? focusedItem.response.asString() : undefined;
				if (isWelcome) {
					const welcomeReplyContents = [];
					for (const content of focusedItem.content) {
						if (Array.isArray(content)) {
							welcomeReplyContents.push(...content.map(m => m.message));
						} else {
							welcomeReplyContents.push((content as IMarkdownString).value);
						}
					}
					responseContent = welcomeReplyContents.join('\n');
				}
				if (!responseContent && 'errorDetails' in focusedItem && focusedItem.errorDetails) {
					responseContent = focusedItem.errorDetails.message;
				}
				if (!responseContent) {
					return false;
				}
				const responses = verifiedWidget.viewModel?.getItems().filter(i => isResponseVM(i));
				const length = responses?.length;
				const responseIndex = responses?.findIndex(i => i === focusedItem);

				accessibleViewService.show({
					id: AccessibleViewProviderId.Chat,
					verbositySettingKey: AccessibilityVerbositySettingId.Chat,
					provideContent(): string { return responseContent!; },
					onClose() {
						verifiedWidget.reveal(focusedItem);
						if (chatInputFocused) {
							verifiedWidget.focusInput();
						} else {
							verifiedWidget.focus(focusedItem);
						}
					},
					next() {
						verifiedWidget.moveFocus(focusedItem, 'next');
						alertFocusChange(responseIndex, length, 'next');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					previous() {
						verifiedWidget.moveFocus(focusedItem, 'previous');
						alertFocusChange(responseIndex, length, 'previous');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					options: { type: AccessibleViewType.View }
				});
				return true;
			}
		}, CONTEXT_IN_CHAT_SESSION));
	}
}

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IChatVariablesService chatVariablesService: IChatVariablesService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Start a new chat"),
			sortText: 'z2_clear',
			executeImmediately: true
		}, async () => {
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true
		}, async (prompt, progress) => {
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);
			const agents = chatAgentService.getAgents();

			// Report prefix
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'content' });
				}
				progress.report({ content: '\n\n', kind: 'content' });
			}

			// Report agent list
			const agentText = (await Promise.all(agents
				.filter(a => a.id !== defaultAgent?.id)
				.map(async a => {
					const agentWithLeader = `${chatAgentLeader}${a.name}`;
					const actionArg: IChatExecuteActionContext = { inputValue: `${agentWithLeader} ${a.metadata.sampleRequest}` };
					const urlSafeArg = encodeURIComponent(JSON.stringify(actionArg));
					const agentLine = `* [\`${agentWithLeader}\`](command:${SubmitAction.ID}?${urlSafeArg}) - ${a.description}`;
					const commandText = a.slashCommands.map(c => {
						const actionArg: IChatExecuteActionContext = { inputValue: `${agentWithLeader} ${chatSubcommandLeader}${c.name} ${c.sampleRequest ?? ''}` };
						const urlSafeArg = encodeURIComponent(JSON.stringify(actionArg));
						return `\t* [\`${chatSubcommandLeader}${c.name}\`](command:${SubmitAction.ID}?${urlSafeArg}) - ${c.description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [SubmitAction.ID] } }), kind: 'markdownContent' });

			// Report variables
			if (defaultAgent?.metadata.helpTextVariablesPrefix) {
				progress.report({ content: '\n\n', kind: 'content' });
				if (isMarkdownString(defaultAgent.metadata.helpTextVariablesPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextVariablesPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: defaultAgent.metadata.helpTextVariablesPrefix, kind: 'content' });
				}

				const variableText = Array.from(chatVariablesService.getVariables())
					.map(v => `* \`${chatVariableLeader}${v.name}\` - ${v.description}`)
					.join('\n');
				progress.report({ content: '\n' + variableText, kind: 'content' });
			}

			// Report help text ending
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: '\n\n', kind: 'content' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'content' });
				}
			}
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatSlashStaticSlashCommandsContribution, LifecyclePhase.Eventually);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatContributionService, ChatContributionService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
