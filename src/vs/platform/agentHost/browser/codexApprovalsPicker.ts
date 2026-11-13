/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/codexApprovalsPicker.css';
import { CODEX_DEFAULT_PERMISSIONS_PRESET, CODEX_PERMISSIONS_PRESET_LABELS, narrowCodexPermissionsPreset } from '../common/codexSessionConfigKeys.js';
import { IActionListOptions } from '../../actionWidget/browser/actionList.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { localize } from '../../../nls.js';

const CODEX_APPROVALS_PICKER_CLASS = 'codex-approvals-picker';
const CODEX_APPROVALS_PICKER_WIDTH = 340;
const CODEX_APPROVALS_PICKER_DETAIL_ITEM_HEIGHT = 76;

/** Returns the shared compact action-list layout for Codex permission presets. */
export function getCodexApprovalsPickerListOptions(): IActionListOptions {
	return {
		className: CODEX_APPROVALS_PICKER_CLASS,
		minWidth: CODEX_APPROVALS_PICKER_WIDTH,
		maxWidth: CODEX_APPROVALS_PICKER_WIDTH,
		detailItemHeight: CODEX_APPROVALS_PICKER_DETAIL_ITEM_HEIGHT,
	};
}

/** Offers to restart a turn with new permissions, returning the continuation message only on Apply Now. */
export async function showCodexPermissionsChangeNotice(dialogService: IDialogService, previousValue: unknown, selectedValue: string): Promise<string | undefined> {
	const previousPreset = narrowCodexPermissionsPreset(previousValue) ?? CODEX_DEFAULT_PERMISSIONS_PRESET;
	const selectedPreset = narrowCodexPermissionsPreset(selectedValue);
	if (!selectedPreset || previousPreset === selectedPreset || (previousPreset !== 'full-access' && selectedPreset !== 'full-access')) {
		return;
	}
	const selectedLabel = CODEX_PERMISSIONS_PRESET_LABELS[selectedPreset];
	const { result } = await dialogService.prompt({
		type: 'question',
		message: selectedPreset === 'full-access'
			? localize('codexApprovals.enableFullAccess.title', "Enable Full Access Now?")
			: localize('codexApprovals.disableFullAccess.title', "Disable Full Access Now?"),
		detail: selectedPreset === 'full-access'
			? localize('codexApprovals.enableFullAccess.detail', "Applying now will stop the current turn and send a new message to continue with Full Access.\n\nClose this dialog to apply the change with your next message after the current turn finishes.")
			: localize('codexApprovals.disableFullAccess.detail', "Applying now will stop the current turn and send a new message to disable Full Access and continue with {0}.\n\nClose this dialog to apply the change with your next message after the current turn finishes.", selectedLabel),
		buttons: [{
			label: localize('codexApprovals.applyNow', "Apply Now"),
			run: () => localize('codexApprovals.continue', "Continue (I changed permissions from {0} to {1})", CODEX_PERMISSIONS_PRESET_LABELS[previousPreset], selectedLabel),
		}],
		custom: true,
	});
	return result;
}
