/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { AbstractDialogHandler, IConfirmation, IConfirmationResult, IPrompt, IAsyncPromptResult } from '../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../../base/browser/markdownRenderer.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';

/** Signals that Electron dismissed a native dialog with an unknown button response. */
export class UnexpectedNativeDialogResponseError extends Error { }

export class NativeDialogHandler extends AbstractDialogHandler {

	constructor(
		@ILogService private readonly logService: ILogService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
		super();
	}

	/**
	 * Native Electron message boxes have no Markdown rendering capability, so
	 * a Markdown `detail` is degraded to its plain-text equivalent rather than
	 * shown with raw Markdown/link syntax.
	 */
	private toNativeDetail(detail: string | IMarkdownString | undefined): string | undefined {
		return typeof detail === 'object' ? renderAsPlaintext(detail) : detail;
	}

	private ensureExpectedResponse(response: number, buttonCount: number, unexpectedResponse: number | undefined): void {
		if (typeof unexpectedResponse === 'number' || !Number.isInteger(response) || response < 0 || response >= buttonCount) {
			throw new UnexpectedNativeDialogResponseError();
		}
	}

	async prompt<T>(prompt: IPrompt<T>): Promise<IAsyncPromptResult<T>> {
		this.logService.trace('DialogService#prompt', prompt.message);

		const buttons = this.getPromptButtons(prompt);

		const { response, checkboxChecked, unexpectedResponse } = await this.nativeHostService.showMessageBox({
			type: this.getDialogType(prompt.type),
			title: prompt.title,
			message: prompt.message,
			detail: this.toNativeDetail(prompt.detail),
			buttons,
			cancelId: prompt.cancelButton ? buttons.length - 1 : -1 /* Disabled */,
			checkboxLabel: prompt.checkbox?.label,
			checkboxChecked: prompt.checkbox?.checked,
			targetWindowId: getActiveWindow().vscodeWindowId
		});
		this.ensureExpectedResponse(response, buttons.length, unexpectedResponse);

		return this.getPromptResult(prompt, response, checkboxChecked);
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const buttons = this.getConfirmationButtons(confirmation);

		const { response, checkboxChecked, unexpectedResponse } = await this.nativeHostService.showMessageBox({
			type: this.getDialogType(confirmation.type) ?? 'question',
			title: confirmation.title,
			message: confirmation.message,
			detail: this.toNativeDetail(confirmation.detail),
			buttons,
			cancelId: buttons.length - 1,
			checkboxLabel: confirmation.checkbox?.label,
			checkboxChecked: confirmation.checkbox?.checked,
			targetWindowId: getActiveWindow().vscodeWindowId
		});
		this.ensureExpectedResponse(response, buttons.length, unexpectedResponse);

		return { confirmed: response === 0, checkboxChecked };
	}

	input(): never {
		throw new Error('Unsupported'); // we have no native API for password dialogs in Electron
	}

	async about(title: string, details: string, detailsToCopy: string): Promise<void> {
		const buttons = [
			localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
			localize('okButton', "OK")
		];
		const { response, unexpectedResponse } = await this.nativeHostService.showMessageBox({
			type: 'info',
			message: title,
			detail: `\n${details}`,
			buttons,
			targetWindowId: getActiveWindow().vscodeWindowId
		});
		this.ensureExpectedResponse(response, buttons.length, unexpectedResponse);

		if (response === 0) {
			this.clipboardService.writeText(detailsToCopy);
		}
	}
}
