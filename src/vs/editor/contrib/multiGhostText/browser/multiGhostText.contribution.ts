/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { AcceptAndNextGhostText, RejectGhostText, ShowMultiGhostText } from 'vs/editor/contrib/multiGhostText/browser/commands';
import { MultiGhostTextController2 } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';

registerEditorAction(ShowMultiGhostText);
registerEditorAction(AcceptAndNextGhostText);
registerEditorAction(RejectGhostText);
// registerEditorAction(SelectNextGhostText);
// registerEditorAction(SelectPreviousGhostText);
// registerEditorAction(AcceptAllGhostText);
// registerEditorAction(AcceptSelectedGhostText);
registerEditorContribution(MultiGhostTextController2.ID, MultiGhostTextController2, EditorContributionInstantiation.Eventually);

