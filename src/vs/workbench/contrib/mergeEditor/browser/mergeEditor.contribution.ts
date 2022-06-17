/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { OpenMergeEditor, ToggleLayout } from 'vs/workbench/contrib/mergeEditor/browser/commands/commands';
import { MergeEditorCopyContentsToJSON, MergeEditorOpenContents } from 'vs/workbench/contrib/mergeEditor/browser/commands/devCommands';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditor } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { MergeEditorSerializer } from './mergeEditorSerializer';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		MergeEditor,
		MergeEditor.ID,
		localize('name', "Merge Editor")
	),
	[
		new SyncDescriptor(MergeEditorInput)
	]
);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	MergeEditorInput.ID,
	MergeEditorSerializer
);

registerAction2(ToggleLayout);
registerAction2(OpenMergeEditor);

registerAction2(MergeEditorCopyContentsToJSON);
registerAction2(MergeEditorOpenContents);
