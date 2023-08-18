/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { AcceptAllGhostText, AcceptSelectedGhostText, SelectNextGhostText, SelectPreviousGhostText, ShowMultiGhostText } from 'vs/editor/contrib/multiGhostText/browser/commands';
import { MultiGhostTextController } from 'vs/editor/contrib/multiGhostText/browser/multiGhostTextController';

registerEditorAction(ShowMultiGhostText);
registerEditorAction(SelectNextGhostText);
registerEditorAction(SelectPreviousGhostText);
registerEditorAction(AcceptAllGhostText);
registerEditorAction(AcceptSelectedGhostText);
registerEditorContribution(MultiGhostTextController.ID, MultiGhostTextController, EditorContributionInstantiation.Eventually);

