/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/codexApprovalsPicker.css';
import { IActionListOptions } from '../../actionWidget/browser/actionList.js';

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
