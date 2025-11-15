/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { NativeProcessExplorerEditor } from './processExplorerEditor.js';
import { ProcessExplorerEditorInput } from '../browser/processExplorerEditorInput.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(NativeProcessExplorerEditor, NativeProcessExplorerEditor.ID, localize('processExplorer', "Process Explorer")),
	[new SyncDescriptor(ProcessExplorerEditorInput)]
);
