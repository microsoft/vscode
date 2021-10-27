/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorExtensions } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/contrib/files/browser/editors/fileEditorInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorPaneRegistry, EditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { NativeTextFileEditor } from 'vs/workbench/contrib/files/electron-sandbox/textFileEditor';

// Register file editor
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		NativeTextFileEditor,
		NativeTextFileEditor.ID,
		nls.localize('textFileEditor', "Text File Editor")
	),
	[
		new SyncDescriptor(FileEditorInput)
	]
);
