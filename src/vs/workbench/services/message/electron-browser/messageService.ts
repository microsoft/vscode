/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import nls = require('vs/nls');
import {WorkbenchMessageService} from 'vs/workbench/services/message/browser/messageService';
import {IConfirmation} from 'vs/platform/message/common/message';
import {isWindows} from 'vs/base/common/platform';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class MessageService extends WorkbenchMessageService {

	constructor(
		private contextService: IWorkspaceContextService,
		private windowService: IWindowService,
		telemetryService: ITelemetryService,
		keybindingService: IKeybindingService
	) {
		super(telemetryService, keybindingService);
	}

	public confirm(confirmation: IConfirmation): boolean {
		if (!confirmation.primaryButton) {
			confirmation.primaryButton = nls.localize({ key: 'yesButton', comment: ['&& denotes a mnemonic'] }, "&&Yes");
		}

		if (!confirmation.secondaryButton) {
			confirmation.secondaryButton = nls.localize('cancelButton', "Cancel");
		}

		let opts: Electron.Dialog.ShowMessageBoxOptions = {
			title: confirmation.title || this.contextService.getConfiguration().env.appName,
			message: confirmation.message,
			buttons: [
				this.mnemonicLabel(confirmation.primaryButton),
				this.mnemonicLabel(confirmation.secondaryButton)
			],
			noLink: true,
			cancelId: 1
		};

		if (confirmation.detail) {
			opts.detail = confirmation.detail;
		}

		let result = this.windowService.getWindow().showMessageBox(opts);

		return result === 0 ? true : false;
	}

	private mnemonicLabel(label: string): string {
		if (!isWindows) {
			return label.replace(/&&/g, ''); // no mnemonic support on mac/linux in buttons yet
		}

		return label.replace(/&&/g, '&');
	}
}