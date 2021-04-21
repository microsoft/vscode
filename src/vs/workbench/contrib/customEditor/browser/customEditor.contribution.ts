/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, Extensions as EditorInputExtensions, IEditorInputFactoryRegistry } from 'vs/workbench/common/editor';
import { customEditorInputFactory, CustomEditorInputSerializer } from 'vs/workbench/contrib/customEditor/browser/customEditorInputFactory';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { WebviewEditor } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditor';
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

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories)
	.registerEditorInputSerializer(
		CustomEditorInputSerializer.ID,
		CustomEditorInputSerializer);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories)
	.registerCustomEditorInputFactory(Schemas.vscodeCustomEditor, customEditorInputFactory);
