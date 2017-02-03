/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import Severity from 'vs/base/common/severity';
import vscode = require('vscode');
import { MainContext, MainThreadMessageServiceShape } from './extHost.protocol';

export class ExtHostMessageService {

	private _proxy: MainThreadMessageServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadMessageService);
	}

	showMessage(severity: Severity, message: string, commands: (string | vscode.MessageItem)[]): Thenable<string | vscode.MessageItem> {

		const items: { title: string; isCloseAffordance: boolean; handle: number; }[] = [];

		for (let handle = 0; handle < commands.length; handle++) {
			let command = commands[handle];
			if (typeof command === 'string') {
				items.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				let {title, isCloseAffordance} = command;
				items.push({ title, isCloseAffordance, handle });
			} else {
				console.warn('Invalid message item:', command);
			}
		}

		return this._proxy.$showMessage(severity, message, items).then(handle => {
			if (typeof handle === 'number') {
				return commands[handle];
			}
			return undefined;
		});
	}
}
