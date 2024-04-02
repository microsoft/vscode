/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { WorkbenchPhase, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { ComplexCustomWorkingCopyEditorHandler as ComplexCustomWorkingCopyEditorHandler, CustomEditorInputSerializer } from 'vs/workbench/contrib/customEditor/browser/customEditorInputFactory';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WebviewEditor } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditor';
import { CustomEditorInput } from './customEditorInput';
import { CustomEditorService } from './customEditors';

registerSingleton(ICustomEditorService, CustomEditorService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(
		EditorPaneDescriptor.create(
			WebviewEditor,
			WebviewEditor.ID,
			'Webview Editor',
		), [
		new SyncDescriptor(CustomEditorInput)
	]);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(CustomEditorInputSerializer.ID, CustomEditorInputSerializer);

registerWorkbenchContribution2(ComplexCustomWorkingCopyEditorHandler.ID, ComplexCustomWorkingCopyEditorHandler, WorkbenchPhase.BlockStartup);
