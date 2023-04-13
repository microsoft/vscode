/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { InlineCompletionsHoverParticipant } from 'vs/editor/contrib/inlineCompletions/browser/hoverParticipant';
import { InlineCompletionsController } from 'vs/editor/contrib/inlineCompletions/browser/inlineCompletionsController';

registerEditorContribution(InlineCompletionsController.ID, InlineCompletionsController, EditorContributionInstantiation.Eventually);

HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);
