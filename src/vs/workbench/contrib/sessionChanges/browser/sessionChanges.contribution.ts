/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ChangesPickerActionViewItemContribution } from './changesPicker.js';
import { VersionsPickerAction } from './changesView.js';

// The changeset picker of the header that the Changes editor of an editor window draws, as the Agents window registers it
registerWorkbenchContribution2(ChangesPickerActionViewItemContribution.ID, ChangesPickerActionViewItemContribution, WorkbenchPhase.BlockRestore);
registerAction2(VersionsPickerAction);
