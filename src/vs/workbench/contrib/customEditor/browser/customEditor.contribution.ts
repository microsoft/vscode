/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { CustomEditorInputSerializer, ComplexCustomWorkingCopyEditorHandler as ComplexCustomWorkingCopyEditorHandler } from 'vs/workbench/contrib/customEditor/browser/customEditorInputFactory';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WebviewEditor } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditor';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CustomEditorInput } from './customEditorInput';
import { CustomEditorService } from './customEditors';

registerSingleton(ICustomEditorService, CustomEditorService);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(
		EditorDescriptor.create(
			WebviewEditor,
			WebviewEditor.ID,
			'Webview Editor',
		), [
		new SyncDescriptor(CustomEditorInput)
	]);

Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories)
	.registerEditorInputSerializer(
		CustomEditorInputSerializer.ID,
		CustomEditorInputSerializer);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ComplexCustomWorkingCopyEditorHandler, LifecyclePhase.Starting);
