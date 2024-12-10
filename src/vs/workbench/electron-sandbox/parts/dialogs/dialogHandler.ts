/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { fromNow } from '../../../../base/common/date.js';
import { isLinuxSnap } from '../../../../base/common/platform.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { AbstractDialogHandler, IConfirmation, IConfirmationResult, IPrompt, IAsyncPromptResult } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { process } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';

export class NativeDialogHandler extends AbstractDialogHandler {

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService private readonly productService: IProductService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super();
	}

	async prompt<T>(prompt: IPrompt<T>): Promise<IAsyncPromptResult<T>> {
		this.logService.trace('DialogService#prompt', prompt.message);

		const buttons = this.getPromptButtons(prompt);

		const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
			type: this.getDialogType(prompt.type),
			title: prompt.title,
			message: prompt.message,
			detail: prompt.detail,
			buttons,
			cancelId: prompt.cancelButton ? buttons.length - 1 : -1 /* Disabled */,
			checkboxLabel: prompt.checkbox?.label,
			checkboxChecked: prompt.checkbox?.checked,
			targetWindowId: getActiveWindow().vscodeWindowId
		});

		return this.getPromptResult(prompt, response, checkboxChecked);
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const buttons = this.getConfirmationButtons(confirmation);

		const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
			type: this.getDialogType(confirmation.type) ?? 'question',
			title: confirmation.title,
			message: confirmation.message,
			detail: confirmation.detail,
			buttons,
			cancelId: buttons.length - 1,
			checkboxLabel: confirmation.checkbox?.label,
			checkboxChecked: confirmation.checkbox?.checked,
			targetWindowId: getActiveWindow().vscodeWindowId
		});

		return { confirmed: response === 0, checkboxChecked };
	}

	input(): never {
		throw new Error('Unsupported'); // we have no native API for password dialogs in Electron
	}

	async about(): Promise<void> {
		let version = this.productService.version;
		if (this.productService.target) {
			version = `${version} (${this.productService.target} setup)`;
		} else if (this.productService.darwinUniversalAssetId) {
			version = `${version} (Universal)`;
		}

		const osProps = await this.nativeHostService.getOSProperties();

		const detailString = (useAgo: boolean): string => {
			return localize({ key: 'aboutDetail', comment: ['Electron, Chromium, Node.js and V8 are product names that need no translation'] },
				"Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nElectronBuildId: {4}\nChromium: {5}\nNode.js: {6}\nV8: {7}\nOS: {8}",
				version,
				this.productService.commit || 'Unknown',
				this.productService.date ? `${this.productService.date}${useAgo ? ' (' + fromNow(new Date(this.productService.date), true) + ')' : ''}` : 'Unknown',
				process.versions['electron'],
				process.versions['microsoft-build'],
				process.versions['chrome'],
				process.versions['node'],
				process.versions['v8'],
				`${osProps.type} ${osProps.arch} ${osProps.release}${isLinuxSnap ? ' snap' : ''}`
			);
		};

		const detail = detailString(true);
		const detailToCopy = detailString(false);

		const { response } = await this.nativeHostService.showMessageBox({
			type: 'info',
			message: this.productService.nameLong,
			detail: `\n${detail}`,
			buttons: [
				localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
				localize('okButton', "OK")
			],
			targetWindowId: getActiveWindow().vscodeWindowId
		});

		if (response === 0) {
			this.clipboardService.writeText(detailToCopy);
		}
	}
}
