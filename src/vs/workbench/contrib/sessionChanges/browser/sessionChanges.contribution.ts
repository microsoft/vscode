/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChangesPickerActionViewItemContribution } from './changesPicker.js';
import { ChangesRepositoryPickerAction, ChangesRepositoryPickerActionViewItemContribution } from './changesRepositoryPicker.js';
import { VersionsPickerAction } from './changesView.js';
import './changesEditorActions.js';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { SessionsChangesAccessibilityHelp } from './sessionsChangesAccessibilityHelp.js';

// The changeset and repository pickers of the header that the Changes editor of an editor window draws, as the Agents window registers them
registerWorkbenchContribution2(ChangesPickerActionViewItemContribution.ID, ChangesPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerAction2(VersionsPickerAction);
registerAction2(ChangesRepositoryPickerAction);
registerWorkbenchContribution2(ChangesRepositoryPickerActionViewItemContribution.ID, ChangesRepositoryPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);

// The help of the Changes editor of an editor window, as the Agents window registers it
AccessibleViewRegistry.register(new SessionsChangesAccessibilityHelp());
