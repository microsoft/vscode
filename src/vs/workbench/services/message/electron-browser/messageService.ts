/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import nls = require('vs/nls');
import {WorkbenchMessageService} from 'vs/workbench/services/message/browser/messageService';
import {IConfirmation} from 'vs/platform/message/common/message';
import {isWindows, isLinux} from 'vs/base/common/platform';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class MessageService extends WorkbenchMessageService {

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWindowService private windowService: IWindowService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		super(telemetryService);
	}

	public confirm(confirmation: IConfirmation): boolean {
		if (!confirmation.primaryButton) {
			confirmation.primaryButton = nls.localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes");
		}

		if (!confirmation.secondaryButton) {
			confirmation.secondaryButton = nls.localize('cancelButton', "Cancel");
		}

		let opts: Electron.ShowMessageBoxOptions = {
			title: confirmation.title || this.contextService.getConfiguration().env.appName,
			message: confirmation.message,
			buttons: [
				isLinux ? this.mnemonicLabel(confirmation.secondaryButton) : this.mnemonicLabel(confirmation.primaryButton),
				isLinux ? this.mnemonicLabel(confirmation.primaryButton) : this.mnemonicLabel(confirmation.secondaryButton)
			],
			noLink: true,
			cancelId: 1
		};

		// Linux: buttons are swapped
		if (isLinux) {
			opts.defaultId = 1;
			opts.cancelId = 0;
		}

		if (confirmation.detail) {
			opts.detail = confirmation.detail;
		}

		let result = this.windowService.getWindow().showMessageBox(opts);

		if (isLinux) {
			return result === 1 ? true : false; // Linux: buttons are swapped
		}

		return result === 0 ? true : false;
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/\(&&\w\)|&&/g, ''); // no mnemonic support on mac/linux
		}

		return label.replace(/&&/g, '&');
	}
}