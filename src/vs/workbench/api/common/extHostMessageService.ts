/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from 'vs/base/common/severity';
import type * as vscode from 'vscode';
import { MainContext, MainThreadMessageServiceShape, MainThreadMessageOptions, IMainContext } from './extHost.protocol';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { checkProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

function isMessageItem(item: any): item is vscode.MessageItem {
	return item && item.title;
}

export class ExtHostMessageService {

	private _proxy: MainThreadMessageServiceShape;

	constructor(
		mainContext: IMainContext,
		@ILogService private readonly _logService: ILogService
	) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadMessageService);
	}


	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | string | undefined, rest: string[]): Promise<string | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | vscode.MessageItem | undefined, rest: vscode.MessageItem[]): Promise<vscode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | vscode.MessageItem | string | undefined, rest: Array<vscode.MessageItem | string>): Promise<string | vscode.MessageItem | undefined>;
	showMessage(extension: IExtensionDescription, severity: Severity, message: string, optionsOrFirstItem: vscode.MessageOptions | string | vscode.MessageItem | undefined, rest: Array<string | vscode.MessageItem>): Promise<string | vscode.MessageItem | undefined> {

		const options: MainThreadMessageOptions = {
			source: { identifier: extension.identifier, label: extension.displayName || extension.name }
		};
		let items: (string | vscode.MessageItem)[];

		if (typeof optionsOrFirstItem === 'string' || isMessageItem(optionsOrFirstItem)) {
			items = [optionsOrFirstItem, ...rest];
		} else {
			options.modal = optionsOrFirstItem?.modal;
			options.useCustom = optionsOrFirstItem?.useCustom;
			options.detail = optionsOrFirstItem?.detail;
			items = rest;
		}

		if (options.useCustom) {
			checkProposedApiEnabled(extension, 'resolvers');
		}

		const commands: { title: string; isCloseAffordance: boolean; handle: number }[] = [];
		let hasCloseAffordance = false;

		for (let handle = 0; handle < items.length; handle++) {
			const command = items[handle];
			if (typeof command === 'string') {
				commands.push({ title: command, handle, isCloseAffordance: false });
			} else if (typeof command === 'object') {
				const { title, isCloseAffordance } = command;
				commands.push({ title, isCloseAffordance: !!isCloseAffordance, handle });
				if (isCloseAffordance) {
					if (hasCloseAffordance) {
						this._logService.warn(`[${extension.identifier}] Only one message item can have 'isCloseAffordance':`, command);
					} else {
						hasCloseAffordance = true;
					}
				}
			} else {
				this._logService.warn(`[${extension.identifier}] Invalid message item:`, command);
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
