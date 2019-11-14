/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, Extensions as EditorExtensions, IEditorRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { CustomEditoInputFactory } from 'vs/workbench/contrib/customEditor/browser/customEditorInputFactory';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WebviewEditor } from 'vs/workbench/contrib/webview/browser/webviewEditor';
import './commands';
import { CustomFileEditorInput } from './customEditorInput';
import { CustomEditorContribution, customEditorsAssociationsKey, CustomEditorService } from './customEditors';
import { workbenchConfigurationNodeBase } from 'vs/workbench/common/configuration';

registerSingleton(ICustomEditorService, CustomEditorService);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(CustomEditorContribution, LifecyclePhase.Starting);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		WebviewEditor,
		WebviewEditor.ID,
		'Webview Editor',
	), [
	new SyncDescriptor(CustomFileEditorInput)
]);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	CustomEditoInputFactory.ID,
	CustomEditoInputFactory);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...workbenchConfigurationNodeBase,
		'properties': {
			[customEditorsAssociationsKey]: {
				type: 'array',
				markdownDescription: nls.localize('editor.editorAssociations', "Configure which editor to use for a resource."),
				items: {
					type: 'object',
					properties: {
						'viewType': {
							type: 'string',
							description: nls.localize('editor.editorAssociations.viewType', "Editor view type."),
						},
						'mime': {
							type: 'string',
							description: nls.localize('editor.editorAssociations.mime', "Mime type the editor should be used for. This is used for binary files."),
						},
						'filenamePattern': {
							type: 'string',
							description: nls.localize('editor.editorAssociations.filenamePattern', "Glob pattern the the editor should be used for."),
						}
					}
				}
			}
		}
	});
