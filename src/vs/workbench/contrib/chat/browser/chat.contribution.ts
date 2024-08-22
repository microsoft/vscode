/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString, isMarkdownString } from '../../../../base/common/htmlContent';
import { Disposable } from '../../../../base/common/lifecycle';
import { Schemas } from '../../../../base/common/network';
import { isMacintosh } from '../../../../base/common/platform';
import * as nls from '../../../../nls';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { Registry } from '../../../../platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor';
import { ChatAccessibilityHelp } from './actions/chatAccessibilityHelp';
import { registerChatActions } from './actions/chatActions';
import { ACTION_ID_NEW_CHAT, registerNewChatActions } from './actions/chatClearActions';
import { registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from './actions/chatCodeblockActions';
import { registerChatContextActions } from './actions/chatContextActions';
import { registerChatCopyActions } from './actions/chatCopyActions';
import { registerChatDeveloperActions } from './actions/chatDeveloperActions';
import { SubmitAction, registerChatExecuteActions } from './actions/chatExecuteActions';
import { registerChatFileTreeActions } from './actions/chatFileTreeActions';
import { registerChatExportActions } from './actions/chatImportExport';
import { registerMoveActions } from './actions/chatMoveActions';
import { registerQuickChatActions } from './actions/chatQuickInputActions';
import { registerChatTitleActions } from './actions/chatTitleActions';
import { IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatWidgetService, IQuickChatService } from './chat';
import { ChatAccessibilityService } from './chatAccessibilityService';
import { ChatEditor, IChatEditorOptions } from './chatEditor';
import { ChatEditorInput, ChatEditorInputSerializer } from './chatEditorInput';
import { agentSlashCommandToMarkdown, agentToMarkdown } from './chatMarkdownDecorationsRenderer';
import { ChatExtensionPointHandler } from './chatParticipantContributions';
import { QuickChatService } from './chatQuick';
import { ChatResponseAccessibleView } from './chatResponseAccessibleView';
import { ChatVariablesService } from './chatVariables';
import { ChatWidgetService } from './chatWidget';
import { ChatCodeBlockContextProviderService } from './codeBlockContextProviderService';
import './contrib/chatContextAttachments';
import './contrib/chatInputCompletions';
import './contrib/chatInputEditorContrib';
import './contrib/chatInputEditorHover';
import { ChatAgentLocation, ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from '../common/chatAgents';
import { chatVariableLeader } from '../common/chatParserTypes';
import { IChatService } from '../common/chatService';
import { ChatService } from '../common/chatServiceImpl';
import { ChatSlashCommandService, IChatSlashCommandService } from '../common/chatSlashCommands';
import { IChatVariablesService } from '../common/chatVariables';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from '../common/chatWidgetHistoryService';
import { ILanguageModelsService, LanguageModelsService } from '../common/languageModels';
import { ILanguageModelStatsService, LanguageModelStatsService } from '../common/languageModelStats';
import { ILanguageModelToolsService, LanguageModelToolsService } from '../common/languageModelToolsService';
import { LanguageModelToolsExtensionPointHandler } from '../common/tools/languageModelToolsContribution';
import { IVoiceChatService, VoiceChatService } from '../common/voiceChatService';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle';
import '../common/chatColors';

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
			deprecated: true,
			default: false
		},
		'chat.experimental.variables.editor': {
			type: 'boolean',
			description: nls.localize('chat.experimental.variables.editor', "Enables variables for editor chat."),
			default: true
		},
		'chat.experimental.variables.notebook': {
			type: 'boolean',
			description: nls.localize('chat.experimental.variables.notebook', "Enables variables for notebook chat."),
			default: false
		},
		'chat.experimental.variables.terminal': {
			type: 'boolean',
			description: nls.localize('chat.experimental.variables.terminal', "Enables variables for terminal chat."),
			default: false
		},
		'chat.experimental.detectParticipant.enabled': {
			type: 'boolean',
			description: nls.localize('chat.experimental.detectParticipant.enabled', "Enables chat participant autodetection for panel chat."),
			default: null
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

AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new ChatAccessibilityHelp());

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IChatVariablesService chatVariablesService: IChatVariablesService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'clear',
			detail: nls.localize('clear', "Start a new chat"),
			sortText: 'z2_clear',
			executeImmediately: true,
			locations: [ChatAgentLocation.Panel]
		}, async () => {
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true,
			locations: [ChatAgentLocation.Panel]
		}, async (prompt, progress) => {
			const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Panel);
			const agents = chatAgentService.getAgents();

			// Report prefix
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: 'markdownContent' });
				}
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
			}

			// Report agent list
			const agentText = (await Promise.all(agents
				.filter(a => a.id !== defaultAgent?.id)
				.filter(a => a.locations.includes(ChatAgentLocation.Panel))
				.map(async a => {
					const description = a.description ? `- ${a.description}` : '';
					const agentMarkdown = instantiationService.invokeFunction(accessor => agentToMarkdown(a, true, accessor));
					const agentLine = `- ${agentMarkdown} ${description}`;
					const commandText = a.slashCommands.map(c => {
						const description = c.description ? `- ${c.description}` : '';
						return `\t* ${agentSlashCommandToMarkdown(a, c)} ${description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [SubmitAction.ID] } }), kind: 'markdownContent' });

			// Report variables
			if (defaultAgent?.metadata.helpTextVariablesPrefix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextVariablesPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextVariablesPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextVariablesPrefix), kind: 'markdownContent' });
				}

				const variables = [
					...chatVariablesService.getVariables(ChatAgentLocation.Panel),
					{ name: 'file', description: nls.localize('file', "Choose a file in the workspace") }
				];
				const variableText = variables
					.map(v => `* \`${chatVariableLeader}${v.name}\` - ${v.description}`)
					.join('\n');
				progress.report({ content: new MarkdownString('\n' + variableText), kind: 'markdownContent' });
			}

			// Report help text ending
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: new MarkdownString('\n\n'), kind: 'markdownContent' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: 'markdownContent' });
				}
			}
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatSlashStaticSlashCommandsContribution, LifecyclePhase.Eventually);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockRestore);

// Disabled until https://github.com/microsoft/vscode/issues/218646 is fixed
// registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, WorkbenchPhase.Eventually);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();
registerChatContextActions();
registerChatDeveloperActions();

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
