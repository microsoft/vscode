/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { InlayHintsController } from 'vs/editor/contrib/inlayHints/browser/inlayHintsController';
import { InlayHintsHover } from 'vs/editor/contrib/inlayHints/browser/inlayHintsHover';

registerEditorContribution(InlayHintsController.ID, InlayHintsController, EditorContributionInstantiation.AfterFirstRender);
HoverParticipantRegistry.register(InlayHintsHover);
