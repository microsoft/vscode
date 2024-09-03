/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
// import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { AcceptInlineEdit, JumpBackInlineEdit, JumpToInlineEdit, RejectInlineEdit, TriggerInlineEdit } from './commands.js';
// import { InlineEditHoverParticipant } from 'vs/editor/contrib/inlineEdit/browser/hoverParticipant';
import { InlineEditController } from './inlineEditController.js';

registerEditorAction(AcceptInlineEdit);
registerEditorAction(RejectInlineEdit);
registerEditorAction(JumpToInlineEdit);
registerEditorAction(JumpBackInlineEdit);
registerEditorAction(TriggerInlineEdit);
registerEditorContribution(InlineEditController.ID, InlineEditController, EditorContributionInstantiation.Eventually);


// HoverParticipantRegistry.register(InlineEditHoverParticipant);
