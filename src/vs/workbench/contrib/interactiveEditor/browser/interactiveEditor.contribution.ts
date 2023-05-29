/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { InteractiveEditorController } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorController';
import * as interactiveEditorActions from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorActions';
import { IInteractiveEditorService, INTERACTIVE_EDITOR_ID } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditor';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { InteractiveEditorServiceImpl } from 'vs/workbench/contrib/interactiveEditor/common/interactiveEditorServiceImpl';
import { IInteractiveEditorSessionService, InteractiveEditorSessionService } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorSession';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { InteractiveEditorNotebookContribution } from 'vs/workbench/contrib/interactiveEditor/browser/interactiveEditorNotebook';

registerSingleton(IInteractiveEditorService, InteractiveEditorServiceImpl, InstantiationType.Delayed);
registerSingleton(IInteractiveEditorSessionService, InteractiveEditorSessionService, InstantiationType.Delayed);

registerEditorContribution(INTERACTIVE_EDITOR_ID, InteractiveEditorController, EditorContributionInstantiation.Eager); // EAGER because of notebook dispose/create of editors

registerAction2(interactiveEditorActions.StartSessionAction);
registerAction2(interactiveEditorActions.UnstashSessionAction);
registerAction2(interactiveEditorActions.MakeRequestAction);
registerAction2(interactiveEditorActions.StopRequestAction);
registerAction2(interactiveEditorActions.DiscardAction);
registerAction2(interactiveEditorActions.DiscardToClipboardAction);
registerAction2(interactiveEditorActions.DiscardUndoToNewFileAction);
registerAction2(interactiveEditorActions.CancelSessionAction);

registerAction2(interactiveEditorActions.ArrowOutUpAction);
registerAction2(interactiveEditorActions.ArrowOutDownAction);
registerAction2(interactiveEditorActions.FocusInteractiveEditor);
registerAction2(interactiveEditorActions.PreviousFromHistory);
registerAction2(interactiveEditorActions.NextFromHistory);
registerAction2(interactiveEditorActions.ViewInChatAction);
registerAction2(interactiveEditorActions.ExpandMessageAction);
registerAction2(interactiveEditorActions.ContractMessageAction);
registerAction2(interactiveEditorActions.AccessibilityHelpEditorAction);

registerAction2(interactiveEditorActions.ToggleInlineDiff);
registerAction2(interactiveEditorActions.FeebackHelpfulCommand);
registerAction2(interactiveEditorActions.FeebackUnhelpfulCommand);
registerAction2(interactiveEditorActions.ApplyPreviewEdits);

registerAction2(interactiveEditorActions.CopyRecordings);


Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
	.registerWorkbenchContribution(InteractiveEditorNotebookContribution, LifecyclePhase.Restored);
