/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { INativeHostMainService } from '../../native/electron-main/nativeHostMainService.js';
import { IProductService } from '../../product/common/productService.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IUpdateService, StateType } from '../common/update.js';

/**
 * Shows a native "no updates available" dialog after an explicit update check, but only on macOS with no open windows
 * (e.g. "Check for Updates" from the menu bar/dock with all windows closed). Otherwise the workbench shows its own
 * themed dialog from the last focused window (see `UpdateContribution`).
 */
export class NotAvailableUpdateDialog extends Disposable {

	constructor(
		updateService: IUpdateService,
		dialogMainService: IDialogMainService,
		windowsMainService: IWindowsMainService,
		productService: IProductService,
		nativeHostMainService: INativeHostMainService,
	) {
		super();

		this._register(updateService.onStateChange(state => {
			if (state.type !== StateType.Idle || !state.notAvailable || state.error) {
				return;
			}

			if (!isMacintosh || windowsMainService.getWindowCount() > 0) {
				return;
			}

			const releaseNotesUrl = productService.releaseNotesUrl;
			const buttons = releaseNotesUrl
				? [
					localize({ key: 'miReleaseNotes', comment: ['&& denotes a mnemonic'] }, "&&Release Notes"),
					localize('ok', "OK")
				]
				: [localize('ok', "OK")];

			void dialogMainService.showMessageBox({
				type: 'info',
				message: localize('noUpdatesAvailable', "There are currently no updates available."),
				buttons,
				cancelId: buttons.length - 1,
			}).then(({ response }) => {
				if (releaseNotesUrl && response === 0) {
					return nativeHostMainService.openExternal(undefined, releaseNotesUrl);
				}
				return undefined;
			});
		}));
	}
}
