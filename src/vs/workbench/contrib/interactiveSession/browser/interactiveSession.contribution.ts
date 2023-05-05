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
import { registerInteractiveSessionActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { registerInteractiveSessionCodeBlockActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCodeblockActions';
import { registerInteractiveSessionCopyActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCopyActions';
import { registerInteractiveSessionExecuteActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionExecuteActions';
import { registerInteractiveSessionTitleActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionTitleActions';
import { InteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionContributionServiceImpl';
import { IInteractiveSessionEditorOptions, InteractiveSessionEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';
import { InteractiveSessionEditorInput, InteractiveSessionEditorInputSerializer } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { IInteractiveSessionWidgetService, InteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionServiceImpl';
import { IInteractiveSessionWidgetHistoryService, InteractiveSessionWidgetHistoryService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionWidgetHistoryService';
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
		}
	}
});


Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		InteractiveSessionEditor,
		InteractiveSessionEditor.ID,
		nls.localize('interactiveSession', "Interactive Session")
	),
	[
		new SyncDescriptor(InteractiveSessionEditorInput)
	]
);

class InteractiveSessionResolverContribution extends Disposable {
	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeInteractiveSesssion}:**/**`,
			{
				id: InteractiveSessionEditor.ID,
				label: nls.localize('interactiveSession', "Interactive Session"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeInteractiveSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(InteractiveSessionEditorInput, resource, options as IInteractiveSessionEditorOptions), options };
				}
			}
		));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveSessionResolverContribution, LifecyclePhase.Starting);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(InteractiveSessionEditorInput.ID, InteractiveSessionEditorInputSerializer);

registerInteractiveSessionActions();
registerInteractiveSessionCopyActions();
registerInteractiveSessionCodeBlockActions();
registerInteractiveSessionTitleActions();
registerInteractiveSessionExecuteActions();

registerSingleton(IInteractiveSessionService, InteractiveSessionService, InstantiationType.Delayed);
registerSingleton(IInteractiveSessionContributionService, InteractiveSessionContributionService, InstantiationType.Delayed);
registerSingleton(IInteractiveSessionWidgetService, InteractiveSessionWidgetService, InstantiationType.Delayed);
registerSingleton(IInteractiveSessionWidgetHistoryService, InteractiveSessionWidgetHistoryService, InstantiationType.Delayed);

import 'vs/workbench/contrib/interactiveSession/browser/contrib/interactiveSessionCodeBlockCopy';
import 'vs/workbench/contrib/interactiveSession/browser/contrib/interactiveSessionInputEditorContrib';
import { Schemas } from 'vs/base/common/network';

