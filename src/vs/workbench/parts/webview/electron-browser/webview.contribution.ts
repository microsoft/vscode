/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { WebviewEditor } from './webviewEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { WebviewInput } from './webviewInput';
import { localize } from 'vs/nls';

(<IEditorRegistry>Registry.as(EditorExtensions.Editors)).registerEditor(new EditorDescriptor(
	WebviewEditor,
	WebviewEditor.ID,
	localize('webview.editor.label', "webview editor")),
	[new SyncDescriptor(WebviewInput)]);