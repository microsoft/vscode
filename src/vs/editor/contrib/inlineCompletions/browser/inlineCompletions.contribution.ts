/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { TriggerInlineSuggestionAction, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, AcceptNextWordOfInlineCompletion, AcceptInlineCompletion, HideInlineCompletion, ToggleAlwaysShowInlineSuggestionToolbar, AcceptNextLineOfInlineCompletion } from './controller/commands.js';
import { InlineCompletionsHoverParticipant } from './hintsWidget/hoverParticipant.js';
import { InlineCompletionsAccessibleView } from './inlineCompletionsAccessibleView.js';
import { InlineCompletionsController } from './controller/inlineCompletionsController.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';

registerEditorContribution(InlineCompletionsController.ID, InlineCompletionsController, EditorContributionInstantiation.Eventually);

registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
registerEditorAction(AcceptNextWordOfInlineCompletion);
registerEditorAction(AcceptNextLineOfInlineCompletion);
registerEditorAction(AcceptInlineCompletion);
registerEditorAction(HideInlineCompletion);
registerAction2(ToggleAlwaysShowInlineSuggestionToolbar);

HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);

AccessibleViewRegistry.register(new InlineCompletionsAccessibleView());
