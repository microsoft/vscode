/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IWindowService} from 'vs/workbench/services/window/electron-browser/windowService';
import nls = require('vs/nls');
import {WorkbenchMessageService} from 'vs/workbench/services/message/browser/messageService';
import {IConfirmation} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

import remote = require('remote');

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
			confirmation.primaryButton = nls.localize('yesButton', "Yes");
		}

		if (!confirmation.secondaryButton) {
			confirmation.secondaryButton = nls.localize('cancelButton', "Cancel");
		}

		let opts: remote.IMessageBoxOptions = {
			title: confirmation.title || this.contextService.getConfiguration().env.appName,
			message: confirmation.message,
			buttons: [
				confirmation.primaryButton,
				confirmation.secondaryButton
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
}