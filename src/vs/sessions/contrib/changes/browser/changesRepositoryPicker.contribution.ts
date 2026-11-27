/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ChangesRepositoryPickerAction, ChangesRepositoryPickerActionViewItemContribution } from '../../../../workbench/contrib/sessionChanges/browser/changesRepositoryPicker.js';

// The repository picker of the headers of the Changes editor and its files, on desktop and web, as the editor window registers it
registerAction2(ChangesRepositoryPickerAction);
registerWorkbenchContribution2(ChangesRepositoryPickerActionViewItemContribution.ID, ChangesRepositoryPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);
