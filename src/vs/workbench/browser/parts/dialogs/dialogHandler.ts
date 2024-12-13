/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfirmation, IConfirmationResult, IInputResult, ICheckbox, IInputElement, ICustomDialogOptions, IInput, AbstractDialogHandler, DialogType, IPrompt, IAsyncPromptResult } from '../../../../platform/dialogs/common/dialogs.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import Severity from '../../../../base/common/severity.js';
import { Dialog, IDialogResult } from '../../../../base/browser/ui/dialog/dialog.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { EventHelper } from '../../../../base/browser/dom.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { fromNow } from '../../../../base/common/date.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MarkdownRenderer } from '../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { defaultButtonStyles, defaultCheckboxStyles, defaultDialogStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { ResultKind } from '../../../../platform/keybinding/common/keybindingResolver.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_INACTIVE_FOREGROUND } from '../../../common/theme.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IHostService } from '../../../services/host/browser/host.js';

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
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IHostService private readonly hostService: IHostService,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
	}

	async prompt<T>(prompt: IPrompt<T>): Promise<IAsyncPromptResult<T>> {
		this.logService.trace('DialogService#prompt', prompt.message);

		const buttons = this.getPromptButtons(prompt);

		const { button, checkboxChecked } = await this.doShow(prompt.type, prompt.message, buttons, prompt.detail, prompt.cancelButton ? buttons.length - 1 : -1 /* Disabled */, prompt.checkbox, undefined, typeof prompt?.custom === 'object' ? prompt.custom : undefined);

		return this.getPromptResult(prompt, button, checkboxChecked);
	}

	async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.logService.trace('DialogService#confirm', confirmation.message);

		const buttons = this.getConfirmationButtons(confirmation);

		const { button, checkboxChecked } = await this.doShow(confirmation.type ?? 'question', confirmation.message, buttons, confirmation.detail, buttons.length - 1, confirmation.checkbox, undefined, typeof confirmation?.custom === 'object' ? confirmation.custom : undefined);

		return { confirmed: button === 0, checkboxChecked };
	}

	async input(input: IInput): Promise<IInputResult> {
		this.logService.trace('DialogService#input', input.message);

		const buttons = this.getInputButtons(input);

		const { button, checkboxChecked, values } = await this.doShow(input.type ?? 'question', input.message, buttons, input.detail, buttons.length - 1, input?.checkbox, input.inputs, typeof input.custom === 'object' ? input.custom : undefined);

		return { confirmed: button === 0, checkboxChecked, values };
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

		const { button } = await this.doShow(
			Severity.Info,
			this.productService.nameLong,
			[
				localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"),
				localize('ok', "OK")
			],
			detail,
			1
		);

		if (button === 0) {
			this.clipboardService.writeText(detailToCopy);
		}
	}

	private async doShow(type: Severity | DialogType | undefined, message: string, buttons?: string[], detail?: string, cancelId?: number, checkbox?: ICheckbox, inputs?: IInputElement[], customOptions?: ICustomDialogOptions, cancellationToken?: CancellationToken): Promise<IDialogResult> {
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
			this.layoutService.activeContainer,
			message,
			buttons,
			{
				detail,
				cancelId,
				type: this.getDialogType(type),
				keyEventProcessor: (event: StandardKeyboardEvent) => {
					const resolved = this.keybindingService.softDispatch(event, this.layoutService.activeContainer);
					if (resolved.kind === ResultKind.KbFound && resolved.commandId) {
						if (BrowserDialogHandler.ALLOWABLE_COMMANDS.indexOf(resolved.commandId) === -1) {
							EventHelper.stop(event, true);
						}
					}
				},
				renderBody,
				icon: customOptions?.icon,
				disableCloseAction: customOptions?.disableCloseAction,
				closeOnLinkClick: customOptions?.closeOnLinkClick,
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

		// Change WCO to match dimmed background
		const setWCOColors = (windowIsActive: boolean, dimmed: boolean) => {
			const theme = this.themeService.getColorTheme();
			const titleBarForegroundColor = theme.getColor(windowIsActive ? TITLE_BAR_ACTIVE_FOREGROUND : TITLE_BAR_INACTIVE_FOREGROUND);
			const titleBarBackgroundColor = theme.getColor(windowIsActive ? TITLE_BAR_ACTIVE_BACKGROUND : TITLE_BAR_INACTIVE_BACKGROUND);

			if (!titleBarForegroundColor || !titleBarBackgroundColor) {
				return;
			}

			const backgroundColor = dimmed ? new Color(new RGBA(0, 0, 0, 0.3)).makeOpaque(titleBarBackgroundColor) : titleBarBackgroundColor;
			const foregroundColor = dimmed ? new Color(new RGBA(0, 0, 0, 0.3)).makeOpaque(titleBarForegroundColor) : titleBarForegroundColor;
			this.nativeHostService.updateWindowControls({
				backgroundColor: backgroundColor.toString(), foregroundColor: foregroundColor.toString()
			});
		};

		setWCOColors(this.hostService.hasFocus, true);
		dialogDisposables.add(this.hostService.onDidChangeFocus(focused => setWCOColors(focused, true)));
		dialogDisposables.add(toDisposable(() => { setWCOColors(true, false); }));

		const result = await dialog.show();
		dialogDisposables.dispose();

		return result;
	}
}
