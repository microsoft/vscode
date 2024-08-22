/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes';
import { InlayHintsController } from './inlayHintsController';
import { InlayHintsHover } from './inlayHintsHover';

registerEditorContribution(InlayHintsController.ID, InlayHintsController, EditorContributionInstantiation.AfterFirstRender);
HoverParticipantRegistry.register(InlayHintsHover);
