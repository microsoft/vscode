/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes';
import { TriggerInlineSuggestionAction, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, AcceptNextWordOfInlineCompletion, AcceptInlineCompletion, HideInlineCompletion, ToggleAlwaysShowInlineSuggestionToolbar, AcceptNextLineOfInlineCompletion } from './commands';
import { InlineCompletionsHoverParticipant } from './hoverParticipant';
import { InlineCompletionsAccessibleView } from './inlineCompletionsAccessibleView';
import { InlineCompletionsController } from './inlineCompletionsController';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { registerAction2 } from '../../../../platform/actions/common/actions';

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
