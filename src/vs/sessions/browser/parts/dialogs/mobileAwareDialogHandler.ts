/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Severity from '../../../../base/common/severity.js';
import { mnemonicButtonLabel } from '../../../../base/common/labels.js';
import { localize } from '../../../../nls.js';
import { AbstractDialogHandler, DialogType, IConfirmation, IConfirmationResult, IInput, IInputResult, IPrompt, IAsyncPromptResult } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { BrowserDialogHandler } from '../../../../workbench/browser/parts/dialogs/dialogHandler.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { isPhoneLayout } from '../mobile/mobileLayout.js';
import { IMobileDialogSheetButton, showMobileDialogSheet } from './mobileDialogSheet.js';

/**
 * Dialog handler for the Agents window that renders confirmations and prompts
 * as native bottom sheets on phone layout, and otherwise delegates to the
 * standard {@link BrowserDialogHandler}.
 *
 * Because every `IDialogService.confirm` / `prompt` call (sessions-layer or
 * inherited from chat / workbench) flows through a single handler, routing it
 * here gives every modal a phone-appropriate presentation without converting
 * call sites one by one. Text input and the about dialog keep the desktop
 * rendering for now.
 */
export class MobileAwareDialogHandler extends AbstractDialogHandler {

	private readonly _desktop: BrowserDialogHandler;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
	) {
		super();
		this._desktop = instantiationService.createInstance(BrowserDialogHandler);
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		if (!isPhoneLayout(this._layoutService)) {
			return this._desktop.confirm(confirmation);
		}

		const labels = this.getConfirmationButtons(confirmation); // [primary, cancel]
		const cancelIndex = labels.length - 1;
		const { button, checkboxChecked } = await showMobileDialogSheet(this._layoutService, {
			title: this._titleFor(confirmation.type),
			message: confirmation.message,
			detail: confirmation.detail,
			buttons: this._toSheetButtons(labels, cancelIndex),
			defaultButtonIndex: cancelIndex,
			checkbox: confirmation.checkbox,
		});

		return { confirmed: button === 0, checkboxChecked };
	}

	async prompt<T>(prompt: IPrompt<T>): Promise<IAsyncPromptResult<T>> {
		if (!isPhoneLayout(this._layoutService)) {
			return this._desktop.prompt(prompt);
		}

		const labels = this.getPromptButtons(prompt);
		const cancelIndex = prompt.cancelButton ? labels.length - 1 : -1;
		const { button, checkboxChecked } = await showMobileDialogSheet(this._layoutService, {
			title: this._titleFor(prompt.type),
			message: prompt.message,
			detail: prompt.detail,
			buttons: this._toSheetButtons(labels, cancelIndex),
			defaultButtonIndex: cancelIndex >= 0 ? cancelIndex : 0,
			checkbox: prompt.checkbox,
		});

		return this.getPromptResult(prompt, button, checkboxChecked);
	}

	// Text input and the about dialog keep the desktop rendering for now.
	input(input: IInput): Promise<IInputResult> {
		return this._desktop.input(input);
	}

	about(title: string, details: string, detailsToCopy: string): Promise<void> {
		return this._desktop.about(title, details, detailsToCopy);
	}

	private _toSheetButtons(labels: string[], cancelIndex: number): IMobileDialogSheetButton[] {
		return labels.map((label, index) => ({
			label: mnemonicButtonLabel(label, true),
			isCancel: index === cancelIndex,
		}));
	}

	private _titleFor(type: Severity | DialogType | undefined): string {
		switch (this.getDialogType(type)) {
			case 'error': return localize('mobileDialog.error', "Error");
			case 'warning': return localize('mobileDialog.warning', "Warning");
			default: return localize('mobileDialog.confirm', "Confirm");
		}
	}
}
