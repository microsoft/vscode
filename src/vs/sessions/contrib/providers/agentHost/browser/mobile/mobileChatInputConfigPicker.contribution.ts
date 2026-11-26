/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../../workbench/common/contributions.js';
import { MobileChatInputConfigPickerAction, MobileChatInputConfigPickerContribution } from '../../../../../../workbench/contrib/sessions/providers/agentHost/browser/mobile/mobileChatInputConfigPicker.js';

registerAction2(MobileChatInputConfigPickerAction);

registerWorkbenchContribution2(MobileChatInputConfigPickerContribution.ID, MobileChatInputConfigPickerContribution, WorkbenchPhase.AfterRestored);
