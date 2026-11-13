/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { INewSessionInputPresentation } from '../newSessionInputPresentation.js';
import { WorktreeSuggestionController } from './worktreeSuggestionController.js';
import { WorktreeSuggestionIsolationPicker } from './worktreeSuggestionIsolationPicker.js';
import { getWorktreeSuggestionAccessibilityHelp } from './worktreeSuggestionPresentation.js';

export const worktreeSuggestionInputPresentation: INewSessionInputPresentation = {
	getAccessibilityHelp: getWorktreeSuggestionAccessibilityHelp,
	createComposer: (container, context, instantiationService) => instantiationService.createInstance(WorktreeSuggestionController, container, context),
	createIsolationPicker: (session, instantiationService) => instantiationService.createInstance(WorktreeSuggestionIsolationPicker, session),
};
