/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { CompareInput1WithBaseCommand, CompareInput2WithBaseCommand, GoToNextConflict, GoToPreviousConflict, OpenBaseFile, OpenMergeEditor, OpenResultResource, SetColumnLayout, SetMixedLayout, ToggleActiveConflictInput1, ToggleActiveConflictInput2 } from 'vs/workbench/contrib/mergeEditor/browser/commands/commands';
import { MergeEditorCopyContentsToJSON, MergeEditorOpenContents } from 'vs/workbench/contrib/mergeEditor/browser/commands/devCommands';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditor, MergeEditorOpenHandlerContribution } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
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

registerAction2(OpenResultResource);
registerAction2(SetMixedLayout);
registerAction2(SetColumnLayout);
registerAction2(OpenMergeEditor);
registerAction2(OpenBaseFile);

registerAction2(MergeEditorCopyContentsToJSON);
registerAction2(MergeEditorOpenContents);

registerAction2(GoToNextConflict);
registerAction2(GoToPreviousConflict);

registerAction2(ToggleActiveConflictInput1);
registerAction2(ToggleActiveConflictInput2);

registerAction2(CompareInput1WithBaseCommand);
registerAction2(CompareInput2WithBaseCommand);


Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MergeEditorOpenHandlerContribution, LifecyclePhase.Restored);
