/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { AcceptInlineEdit, JumpBackInlineEdit, JumpToInlineEdit, RejectInlineEdit } from 'vs/editor/contrib/inlineEdit/browser/commands';
import { InlineEditController } from 'vs/editor/contrib/inlineEdit/browser/inlineEditController';

registerEditorAction(AcceptInlineEdit);
registerEditorAction(RejectInlineEdit);
registerEditorAction(JumpToInlineEdit);
registerEditorAction(JumpBackInlineEdit);
registerEditorContribution(InlineEditController.ID, InlineEditController, EditorContributionInstantiation.Eventually);
