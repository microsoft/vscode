/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { AcceptAllInput1, AcceptAllInput2, CompareInput1WithBaseCommand, CompareInput2WithBaseCommand, GoToNextUnhandledConflict, GoToPreviousUnhandledConflict, OpenBaseFile, OpenMergeEditor, OpenResultResource, ResetDirtyConflictsToBaseCommand, ResetToBaseAndAutoMergeCommand, SetColumnLayout, SetMixedLayout, SetMixedLayoutWithBase, SetMixedLayoutWithBaseColumns, ToggleActiveConflictInput1, ToggleActiveConflictInput2 } from 'vs/workbench/contrib/mergeEditor/browser/commands/commands';
import { MergeEditorCopyContentsToJSON, MergeEditorSaveContentsToFolder, MergeEditorLoadContentsFromFolder } from 'vs/workbench/contrib/mergeEditor/browser/commands/devCommands';
import { MergeEditorInput } from 'vs/workbench/contrib/mergeEditor/browser/mergeEditorInput';
import { MergeEditor, MergeEditorResolverContribution, MergeEditorOpenHandlerContribution } from 'vs/workbench/contrib/mergeEditor/browser/view/mergeEditor';
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

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	properties: {
		'mergeEditor.diffAlgorithm': {
			type: 'string',
			enum: ['smart', 'experimental'],
			default: 'smart',
			markdownEnumDescriptions: [
				localize('diffAlgorithm.smart', "Uses the default diffing algorithm."),
				localize('diffAlgorithm.experimental', "Uses an experimental diffing algorithm."),
			]
		},
	}
});

registerAction2(OpenResultResource);
registerAction2(SetMixedLayout);
registerAction2(SetColumnLayout);
registerAction2(SetMixedLayoutWithBase);
registerAction2(SetMixedLayoutWithBaseColumns);
registerAction2(OpenMergeEditor);
registerAction2(OpenBaseFile);

registerAction2(GoToNextUnhandledConflict);
registerAction2(GoToPreviousUnhandledConflict);

registerAction2(ToggleActiveConflictInput1);
registerAction2(ToggleActiveConflictInput2);

registerAction2(CompareInput1WithBaseCommand);
registerAction2(CompareInput2WithBaseCommand);

registerAction2(AcceptAllInput1);
registerAction2(AcceptAllInput2);

registerAction2(ResetToBaseAndAutoMergeCommand);
registerAction2(ResetDirtyConflictsToBaseCommand);

// Dev Commands
registerAction2(MergeEditorCopyContentsToJSON);
registerAction2(MergeEditorSaveContentsToFolder);
registerAction2(MergeEditorLoadContentsFromFolder);

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MergeEditorOpenHandlerContribution, 'MergeEditorOpenHandlerContribution', LifecyclePhase.Restored);

Registry
	.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(MergeEditorResolverContribution, 'MergeEditorResolverContribution', LifecyclePhase.Starting);
