/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import {
	TriggerInlineEditAction, ShowNextInlineEditAction, ShowPreviousInlineEditAction,
	AcceptInlineEdit, HideInlineEdit,
} from 'vs/editor/contrib/inlineEdits/browser/commands';
import { InlineEditsController } from 'vs/editor/contrib/inlineEdits/browser/inlineEditsController';

registerEditorContribution(InlineEditsController.ID, InlineEditsController, EditorContributionInstantiation.Eventually);

registerEditorAction(TriggerInlineEditAction);
registerEditorAction(ShowNextInlineEditAction);
registerEditorAction(ShowPreviousInlineEditAction);
registerEditorAction(AcceptInlineEdit);
registerEditorAction(HideInlineEdit);
