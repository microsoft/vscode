/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import vscode = require('vscode');
import { MainContext, MainThreadMessageServiceShape, MainThreadMessageOptions, IMainContext } from './extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';


function isMessageItem<T>(item: any): item is vscode.MessageItem {
	return item && item.title;
}

export class ExtHostMessageService {

	private _proxy: MainThreadMessageServiceShape;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.get(MainContext.MainThreadMessageService);
	}

	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | string, rest: string[]): Thenable<string | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | vscode.MessageItem, rest: vscode.MessageItem[]): Thenable<vscode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | string | vscode.MessageItem, rest: (string | vscode.MessageItem)[]): Thenable<string | vscode.MessageItem | undefined> {

		let options: MainThreadMessageOptions = { extension };
		let items: (string | vscode.MessageItem)[];

		if (typeof optionsOrFirstItem === 'string' || isMessageItem(optionsOrFirstItem)) {
			items = [optionsOrFirstItem, ...rest];
		} else {
			options.modal = optionsOrFirstItem && optionsOrFirstItem.modal;
			items = rest;
		}

		const commands: { title: string; isCloseAffordance: boolean; handle: number; }[] = [];

		for (let handle = 0; handle < items.length; handle++) {
			let command = items[handle];
			if (typeof command === 'string') {
				commands.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				let { title, isCloseAffordance } = command;
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
