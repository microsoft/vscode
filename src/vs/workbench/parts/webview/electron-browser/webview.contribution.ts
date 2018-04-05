/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { WebviewEditor } from './webviewEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { WebviewEditorInput } from './webviewInput';
import { localize } from 'vs/nls';
import { IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IWebviewService, WebviewService } from './webviewService';
import { WebviewInputFactory } from 'vs/workbench/parts/webview/electron-browser/webviewInputFactory';

(Registry.as<IEditorRegistry>(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewEditorInput)]);

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(
	WebviewInputFactory.ID,
	WebviewInputFactory);

registerSingleton(IWebviewService, WebviewService);
