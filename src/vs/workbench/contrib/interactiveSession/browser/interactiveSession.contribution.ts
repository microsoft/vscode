/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { registerChatActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { registerChatCodeBlockActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCodeblockActions';
import { registerChatCopyActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCopyActions';
import { registerChatExecuteActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionExecuteActions';
import { registerChatTitleActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionTitleActions';
import { registerChatQuickQuestionActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionQuickInputActions';
import { IChatWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSession';
import { ChatContributionService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionContributionServiceImpl';
import { IChatEditorOptions, ChatEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';
import { ChatEditorInput, ChatEditorInputSerializer } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { ChatWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IChatContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { IChatService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { ChatService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionServiceImpl';
import { IChatWidgetHistoryService, ChatWidgetHistoryService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWidgetHistoryService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/interactiveSessionColors';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'interactiveSessionSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Interactive Session"),
	type: 'object',
	properties: {
		'interactiveSession.editor.fontSize': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in Interactive Sessions."),
			default: isMacintosh ? 12 : 14,
		},
		'interactiveSession.editor.fontFamily': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in Interactive Sessions."),
			default: 'default'
		},
		'interactiveSession.editor.fontWeight': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in Interactive Sessions."),
			default: 'default'
		},
		'interactiveSession.editor.wordWrap': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.wordWrap', "Controls whether lines should wrap in Interactive Sessions."),
			default: 'off',
			enum: ['on', 'off']
		},
		'interactiveSession.editor.lineHeight': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in Interactive Sessions. Use 0 to compute the line height from the font size."),
			default: 0
		},
		'interactiveSession.experimental.quickQuestion.enable': {
			type: 'boolean',
			description: nls.localize('interactiveSession.experimental.quickQuestion.enable', "Controls whether the quick question feature is enabled."),
			default: false,
			tags: ['experimental']
		}
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
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeInteractiveSesssion}:**/**`,
			{
				id: ChatEditorInput.EditorID,
				label: nls.localize('chat', "Chat"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeInteractiveSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(ChatEditorInput, resource, options as IChatEditorOptions), options };
				}
			}
		));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatResolverContribution, LifecyclePhase.Starting);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatTitleActions();
registerChatExecuteActions();
registerChatQuickQuestionActions();

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatContributionService, ChatContributionService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);

import 'vs/workbench/contrib/interactiveSession/browser/contrib/interactiveSessionInputEditorContrib';
import { Schemas } from 'vs/base/common/network';
