/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from 'vs/platform/actions/common/actions';
import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { InteractiveEditorController } from 'vs/editor/contrib/interactive/browser/interactiveEditorWidget';
import * as interactiveEditorActions from 'vs/editor/contrib/interactive/browser/interactiveEditorActions';
import { IInteractiveEditorService } from 'vs/editor/contrib/interactive/common/interactiveEditor';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { InteractiveEditorServiceImpl } from 'vs/editor/contrib/interactive/common/interactiveEditorServiceImpl';

registerSingleton(IInteractiveEditorService, InteractiveEditorServiceImpl, InstantiationType.Delayed);

registerEditorContribution(InteractiveEditorController.ID, InteractiveEditorController, EditorContributionInstantiation.Lazy);

registerAction2(interactiveEditorActions.StartSessionAction);
registerAction2(interactiveEditorActions.ToggleHistory);
registerAction2(interactiveEditorActions.MakeRequestAction);
registerAction2(interactiveEditorActions.StopRequestAction);
registerAction2(interactiveEditorActions.AcceptWithPreviewInteractiveEditorAction);
registerAction2(interactiveEditorActions.TogglePreviewMode);
registerAction2(interactiveEditorActions.CancelSessionAction);
registerAction2(interactiveEditorActions.ArrowOutUpAction);
registerAction2(interactiveEditorActions.ArrowOutDownAction);
registerAction2(interactiveEditorActions.FocusInteractiveEditor);
registerAction2(interactiveEditorActions.PreviousFromHistory);
registerAction2(interactiveEditorActions.NextFromHistory);
registerAction2(interactiveEditorActions.UndoCommand);
registerAction2(interactiveEditorActions.CopyRecordings);
