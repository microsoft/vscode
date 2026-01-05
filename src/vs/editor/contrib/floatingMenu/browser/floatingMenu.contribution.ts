/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './floatingMenu.css';
import { registerEditorContribution, EditorContributionInstantiation } from '../../../browser/editorExtensions.js';
import { FloatingEditorToolbar } from './floatingMenu.js';

registerEditorContribution(FloatingEditorToolbar.ID, FloatingEditorToolbar, EditorContributionInstantiation.AfterFirstRender);
