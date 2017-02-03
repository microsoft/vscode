/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import Severity from 'vs/base/common/severity';
import vscode = require('vscode');
import { MainContext, MainThreadMessageServiceShape } from './extHost.protocol';

const emptyMessageOptions: vscode.MessageOptions = Object.create(null);

function isMessageItem<T>(item: any): item is vscode.MessageItem {
	return item && item.title;
}

function parseMessageArguments(first: vscode.MessageOptions | string | vscode.MessageItem, rest: (string | vscode.MessageItem)[]): { options: vscode.MessageOptions; items: (string | vscode.MessageItem)[]; } {
	if (typeof first === 'string' || isMessageItem(first)) {
		return { options: emptyMessageOptions, items: [first, ...rest] };
	} else {
		return { options: first || emptyMessageOptions, items: rest };
	}
}

export class ExtHostMessageService {

	private _proxy: MainThreadMessageServiceShape;

	constructor(threadService: IThreadService) {
		this._proxy = threadService.get(MainContext.MainThreadMessageService);
	}

	showMessage(severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | string | vscode.MessageItem, rest: (string | vscode.MessageItem)[]): Thenable<string | vscode.MessageItem> {
		const { options, items } = parseMessageArguments(optionsOrFirstItem, rest);
		const commands: { title: string; isCloseAffordance: boolean; handle: number; }[] = [];

		for (let handle = 0; handle < items.length; handle++) {
			let command = items[handle];
			if (typeof command === 'string') {
				commands.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				let {title, isCloseAffordance} = command;
				commands.push({ title, isCloseAffordance, handle });
			} else {
				console.warn('Invalid message item:', command);
			}
		}

		return this._proxy.$showMessage(severity, message, options, commands).then(handle => {
			if (typeof handle === 'number') {
				return items[handle];
			}
			return undefined;
		});
	}
}
