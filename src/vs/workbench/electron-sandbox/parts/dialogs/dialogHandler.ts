/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { fromNow } from 'vs/base/common/date';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isLinux, isLinuxSnap, isWindows } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { MessageBoxOptions } from 'vs/base/parts/sandbox/common/electronTypes';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { AbstractDialogHandler, IConfirmation, IConfirmationResult, IDialogOptions, ITwoButtonPrompt, ITwoButtonPromptResult, IShowResult, IFourButtonPrompt, IFourButtonPromptResult, IThreeButtonPrompt, IThreeButtonPromptResult, massageMessageBoxOptions, IOneButtonPrompt, IOneButtonPromptResult, isOneButtonPrompt } from 'vs/platform/dialogs/common/dialogs';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IProductService } from 'vs/platform/product/common/productService';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';

interface IMassagedMessageBoxOptions {

	/**
	 * OS massaged message box options.
	 */
	options: MessageBoxOptions;

	/**
	 * Since the massaged result of the message box options potentially
	 * changes the order of buttons, we have to keep a map of these
	 * changes so that we can still return the correct index to the caller.
	 */
	buttonIndexMap: number[];
}

export class NativeDialogHandler extends AbstractDialogHandler {

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IProductService private readonly productService: IProductService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super();
	}

	prompt(prompt: IOneButtonPrompt): Promise<IOneButtonPromptResult>;
	prompt(prompt: ITwoButtonPrompt): Promise<ITwoButtonPromptResult>;
	prompt(prompt: IThreeButtonPrompt): Promise<IThreeButtonPromptResult>;
	prompt(prompt: IFourButtonPrompt): Promise<IFourButtonPromptResult>;
	async prompt(prompt: IOneButtonPrompt | ITwoButtonPrompt | IThreeButtonPrompt | IFourButtonPrompt): Promise<IOneButtonPromptResult | ITwoButtonPromptResult | IThreeButtonPromptResult | IFourButtonPromptResult> {
		this.logService.trace('DialogService#prompt', prompt.message);

		const buttons = this.toPromptButtons(prompt);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({
			type: this.getDialogType(prompt.type),
			message: prompt.message,
			detail: prompt.detail,
			buttons,
			cancelId: buttons.length - 1,
			checkboxLabel: prompt.checkbox?.label,
			checkboxChecked: prompt.checkbox?.checked
		});

		const result = await this.nativeHostService.showMessageBox(options);

		if (isOneButtonPrompt(prompt)) {
			return {
				checkboxChecked: result.checkboxChecked
			};
		}

		return {
			choice: this.toPromptResult(prompt, buttonIndexMap[result.response]),
			checkboxChecked: result.checkboxChecked
		};
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const buttons = this.toConfirmationButtons(confirmation);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({
			title: confirmation.title,
			type: this.getDialogType(confirmation.type),
			message: confirmation.message,
			detail: confirmation.detail,
			buttons,
			cancelId: buttons.length - 1,
			checkboxLabel: confirmation.checkbox?.label,
			checkboxChecked: confirmation.checkbox?.checked
		});

		const result = await this.nativeHostService.showMessageBox(options);

		return {
			confirmed: buttonIndexMap[result.response] === 0 ? true : false,
			checkboxChecked: result.checkboxChecked
		};
	}

	async show(severity: Severity, message: string, buttons?: string[], dialogOptions?: IDialogOptions): Promise<IShowResult> {
		this.logService.trace('DialogService#show', message);

		const { options, buttonIndexMap } = this.massageMessageBoxOptions({
			type: this.getDialogType(severity),
			message,
			detail: dialogOptions ? dialogOptions.detail : undefined,
			buttons,
			cancelId: dialogOptions ? dialogOptions.cancelId : undefined,
			checkboxLabel: dialogOptions?.checkbox?.label ?? undefined,
			checkboxChecked: dialogOptions?.checkbox?.checked ?? undefined
		});

		const result = await this.nativeHostService.showMessageBox(options);
		return { choice: buttonIndexMap[result.response], checkboxChecked: result.checkboxChecked };
	}

	private massageMessageBoxOptions(options: MessageBoxOptions): IMassagedMessageBoxOptions {
		let buttonIndexMap = (options.buttons || []).map((button, index) => index);
		let buttons = (options.buttons || []).map(button => mnemonicButtonLabel(button));
		let cancelId = options.cancelId;

		// Linux: order of buttons is reverse
		// macOS: also reverse, but the OS handles this for us!
		if (isLinux) {
			buttons = buttons.reverse();
			buttonIndexMap = buttonIndexMap.reverse();
		}

		// Default Button (always first one)
		options.defaultId = buttonIndexMap[0];

		// Cancel Button
		if (typeof cancelId === 'number') {

			// Ensure the cancelId is the correct one from our mapping
			cancelId = buttonIndexMap[cancelId];

			// macOS/Linux: the cancel button should always be to the left of the primary action
			// if we see more than 2 buttons, move the cancel one to the left of the primary
			if (!isWindows && buttons.length > 2 && cancelId !== 1) {
				const cancelButton = buttons[cancelId];
				buttons.splice(cancelId, 1);
				buttons.splice(1, 0, cancelButton);

				const cancelButtonIndex = buttonIndexMap[cancelId];
				buttonIndexMap.splice(cancelId, 1);
				buttonIndexMap.splice(1, 0, cancelButtonIndex);

				cancelId = 1;
			}
		}

		options.buttons = buttons;
		options.cancelId = cancelId;
		options.noLink = true;
		options.title = options.title || this.productService.nameLong;

		return { options, buttonIndexMap };
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
				"Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nChromium: {4}\nNode.js: {5}\nV8: {6}\nOS: {7}\nSandboxed: {8}",
				version,
				this.productService.commit || 'Unknown',
				this.productService.date ? `${this.productService.date}${useAgo ? ' (' + fromNow(new Date(this.productService.date), true) + ')' : ''}` : 'Unknown',
				process.versions['electron'],
				process.versions['chrome'],
				process.versions['node'],
				process.versions['v8'],
				`${osProps.type} ${osProps.arch} ${osProps.release}${isLinuxSnap ? ' snap' : ''}`,
				process.sandboxed ? 'Yes' : 'No' // TODO@bpasero remove me once sandbox is final
			);
		};

		const detail = detailString(true);
		const detailToCopy = detailString(false);

		const { options, buttonIndeces } = massageMessageBoxOptions({
			type: 'info',
			message: this.productService.nameLong,
			detail: `\n${detail}`,
			buttons: [
				localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
				localize('okButton', "OK")
			]
		}, this.productService);

		const result = await this.nativeHostService.showMessageBox(options);
		if (buttonIndeces[result.response] === 0) {
			this.clipboardService.writeText(detailToCopy);
		}
	}
}
