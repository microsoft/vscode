/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerEditorAction, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { GhostTextController, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, TriggerInlineSuggestionAction } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { InlineCompletionsHoverParticipant } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsHoverParticipant';

registerEditorContribution(GhostTextController.ID, GhostTextController);
registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);
