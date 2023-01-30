/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IDialogOptions, IConfirmation, IConfirmationResult, IShowResult, IInputResult, ICheckbox, IInputElement, ICustomDialogOptions, IInput, AbstractDialogHandler, ITwoButtonPrompt, ITwoButtonPromptResult, IFourButtonPrompt, IFourButtonPromptResult, IThreeButtonPrompt, IThreeButtonPromptResult, IOneButtonPrompt, IOneButtonPromptResult, isOneButtonPrompt, DialogType } from 'vs/platform/dialogs/common/dialogs';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { ILogService } from 'vs/platform/log/common/log';
import Severity from 'vs/base/common/severity';
import { Dialog, IDialogResult } from 'vs/base/browser/ui/dialog/dialog';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventHelper } from 'vs/base/browser/dom';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IProductService } from 'vs/platform/product/common/productService';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { fromNow } from 'vs/base/common/date';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MarkdownRenderer } from 'vs/editor/contrib/markdownRenderer/browser/markdownRenderer';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';

export class BrowserDialogHandler extends AbstractDialogHandler {

	private static readonly ALLOWABLE_COMMANDS = [
		'copy',
		'cut',
		'editor.action.selectAll',
		'editor.action.clipboardCopyAction',
		'editor.action.clipboardCutAction',
		'editor.action.clipboardPasteAction'
	];

	private readonly markdownRenderer = this.instantiationService.createInstance(MarkdownRenderer, {});

	constructor(
		@ILogService private readonly logService: ILogService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
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

		const result = await this.doShow(prompt.type, prompt.message, buttons, prompt.detail, buttons.length - 1, prompt.checkbox, undefined, typeof prompt?.custom === 'object' ? prompt.custom : undefined);

		if (isOneButtonPrompt(prompt)) {
			return {
				checkboxChecked: result.checkboxChecked
			};
		}

		return {
			choice: this.toPromptResult(prompt, result.button),
			checkboxChecked: result.checkboxChecked
		};
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const buttons = this.toConfirmationButtons(confirmation);

		const result = await this.doShow(confirmation.type, confirmation.message, buttons, confirmation.detail, buttons.length - 1, confirmation.checkbox, undefined, typeof confirmation?.custom === 'object' ? confirmation.custom : undefined);

		return {
			confirmed: result.button === 0,
			checkboxChecked: result.checkboxChecked
		};
	}

	async input(input: IInput): Promise<IInputResult> {
		this.logService.trace('DialogService#input', input.message);

		const buttons = this.toInputButtons(input);

		const result = await this.doShow(input.type, input.message, buttons, input.detail, buttons.length - 1, input?.checkbox, input.inputs);

		return {
			confirmed: result.button === 0,
			checkboxChecked: result.checkboxChecked,
			values: result.values
		};
	}

	async show(severity: Severity, message: string, buttons?: string[], options?: IDialogOptions): Promise<IShowResult> {
		this.logService.trace('DialogService#show', message);

		const result = await this.doShow(severity, message, buttons, options?.detail, options?.cancelId, options?.checkbox, undefined, typeof options?.custom === 'object' ? options.custom : undefined);

		return {
			choice: result.button,
			checkboxChecked: result.checkboxChecked
		};
	}

	private async doShow(type: Severity | DialogType | undefined, message: string, buttons?: string[], detail?: string, cancelId?: number, checkbox?: ICheckbox, inputs?: IInputElement[], customOptions?: ICustomDialogOptions): Promise<IDialogResult> {
		const dialogDisposables = new DisposableStore();

		const renderBody = customOptions ? (parent: HTMLElement) => {
			parent.classList.add(...(customOptions.classes || []));
			customOptions.markdownDetails?.forEach(markdownDetail => {
				const result = this.markdownRenderer.render(markdownDetail.markdown);
				parent.appendChild(result.element);
				result.element.classList.add(...(markdownDetail.classes || []));
				dialogDisposables.add(result);
			});
		} : undefined;

		const dialog = new Dialog(
			this.layoutService.container,
			message,
			buttons,
			{
				detail,
				cancelId,
				type: this.getDialogType(type),
				keyEventProcessor: (event: StandardKeyboardEvent) => {
					const resolved = this.keybindingService.softDispatch(event, this.layoutService.container);
					if (resolved?.commandId) {
						if (BrowserDialogHandler.ALLOWABLE_COMMANDS.indexOf(resolved.commandId) === -1) {
							EventHelper.stop(event, true);
						}
					}
				},
				renderBody,
				icon: customOptions?.icon,
				disableCloseAction: customOptions?.disableCloseAction,
				buttonDetails: customOptions?.buttonDetails,
				checkboxLabel: checkbox?.label,
				checkboxChecked: checkbox?.checked,
				inputs,
				buttonStyles: defaultButtonStyles,
				checkboxStyles: defaultCheckboxStyles,
				inputBoxStyles: defaultInputBoxStyles,
				dialogStyles: defaultDialogStyles
			}
		);

		dialogDisposables.add(dialog);

		const result = await dialog.show();
		dialogDisposables.dispose();

		return result;
	}

	async about(): Promise<void> {
		const detailString = (useAgo: boolean): string => {
			return localize('aboutDetail',
				"Version: {0}\nCommit: {1}\nDate: {2}\nBrowser: {3}",
				this.productService.version || 'Unknown',
				this.productService.commit || 'Unknown',
				this.productService.date ? `${this.productService.date}${useAgo ? ' (' + fromNow(new Date(this.productService.date), true) + ')' : ''}` : 'Unknown',
				navigator.userAgent
			);
		};

		const detail = detailString(true);
		const detailToCopy = detailString(false);

		const { choice } = await this.show(
			Severity.Info,
			this.productService.nameLong,
			[
				localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
				localize('ok', "OK")
			],
			{
				detail,
				cancelId: 1
			}
		);

		if (choice === 0) {
			this.clipboardService.writeText(detailToCopy);
		}
	}
}
