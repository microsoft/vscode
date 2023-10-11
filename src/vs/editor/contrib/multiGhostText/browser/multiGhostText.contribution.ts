/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { AcceptAndNextGhostText, RejectGhostText, ShowMultiGhostText } from 'vs/editor/contrib/multiGhostText/browser/commands';
import { AcceptAllGhostTextMulti, AcceptSelectedGhostTextMulti, SelectNextGhostTextMulti, SelectPreviousGhostTextMulti, ShowMultiGhostTextMulti } from 'vs/editor/contrib/multiGhostText/browser/commandsMulti';
import { MultiGhostTextController, MultiGhostTextControllerMulti } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';

registerEditorAction(ShowMultiGhostText);
registerEditorAction(AcceptAndNextGhostText);
registerEditorAction(RejectGhostText);
registerEditorContribution(MultiGhostTextController.ID, MultiGhostTextController, EditorContributionInstantiation.Eventually);


registerEditorAction(ShowMultiGhostTextMulti);
registerEditorAction(SelectNextGhostTextMulti);
registerEditorAction(SelectPreviousGhostTextMulti);
registerEditorAction(AcceptAllGhostTextMulti);
registerEditorAction(AcceptSelectedGhostTextMulti);
registerEditorContribution(MultiGhostTextControllerMulti.ID, MultiGhostTextControllerMulti, EditorContributionInstantiation.Eventually);
