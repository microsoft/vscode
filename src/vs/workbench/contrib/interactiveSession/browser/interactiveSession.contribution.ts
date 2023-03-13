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
import { EditorExtensions } from 'vs/workbench/common/editor';
import { registerInteractiveSessionActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionActions';
import { InteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionContributionServiceImpl';
import { InteractiveSessionEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';
import { InteractiveSessionEditorInput } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditorInput';
import { IInteractiveSessionContributionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionContributionService';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionServiceImpl';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/interactiveSessionColors';
import { IInteractiveSessionWidgetService, InteractiveSessionWidgetService } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionWidget';
import { registerInteractiveSessionCopyActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCopyActions';
import { registerInteractiveSessionCodeBlockActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionCodeblockActions';
import { registerInteractiveSessionTitleActions } from 'vs/workbench/contrib/interactiveSession/browser/actions/interactiveSessionTitleActions';


// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'interactiveSessionSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Interactive Session"),
	type: 'object',
	properties: {
		'interactiveSession.editor.fontSize': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in the Interactive Session Sidebar."),
			default: isMacintosh ? 12 : 14,
		},
		'interactiveSession.editor.fontFamily': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in the Interactive Session Sidebar."),
			default: 'default'
		},
		'interactiveSession.editor.fontWeight': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in the Interactive Session Sidebar."),
			default: 'default'
		},
		'interactiveSession.editor.lineHeight': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in the Interactive Session Sidebar. Use 0 to compute the line height from the font size."),
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
			`${InteractiveSessionEditor.SCHEME}:**/**`,
			{
				id: InteractiveSessionEditor.ID,
				label: nls.localize('interactiveSession', "Interactive Session"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === InteractiveSessionEditor.SCHEME
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(InteractiveSessionEditorInput, resource), options };
				}
			}
		));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(InteractiveSessionResolverContribution, LifecyclePhase.Starting);

registerInteractiveSessionActions();
registerInteractiveSessionCopyActions();
registerInteractiveSessionCodeBlockActions();
registerInteractiveSessionTitleActions();

registerSingleton(IInteractiveSessionService, InteractiveSessionService, InstantiationType.Delayed);
registerSingleton(IInteractiveSessionContributionService, InteractiveSessionContributionService, InstantiationType.Delayed);
registerSingleton(IInteractiveSessionWidgetService, InteractiveSessionWidgetService, InstantiationType.Delayed);

import 'vs/workbench/contrib/interactiveSession/browser/contrib/interactiveSessionInputEditorDecorations';
