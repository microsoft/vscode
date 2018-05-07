/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { Component } from 'vs/workbench/common/component';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IQuickOpenService, IPickOpenEntry, IPickOptions, IInputOptions } from 'vs/platform/quickOpen/common/quickOpen';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken } from 'vs/base/common/cancellation';
import { QuickInputCheckboxList } from './quickInputCheckboxList';
import { QuickInputBox } from './quickInputBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CLOSE_ON_FOCUS_LOST_CONFIG } from 'vs/workbench/browser/quickopen';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { attachBadgeStyler, attachProgressBarStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { chain, debounceEvent } from 'vs/base/common/event';
import { Button } from 'vs/base/browser/ui/button/button';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import Severity from 'vs/base/common/severity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const $ = dom.$;

type InputParameters = SelectManyParameters | TextInputParameters;

export interface BaseInputParameters {
	readonly type: 'selectMany' | 'textInput';
	readonly ignoreFocusLost?: boolean;
}

export interface SelectManyParameters<T extends IPickOpenEntry = IPickOpenEntry> extends BaseInputParameters {
	readonly type: 'selectMany';
	readonly picks: TPromise<T[]>;
	readonly matchOnDescription?: boolean;
	readonly matchOnDetail?: boolean;
	readonly placeHolder?: string;
}

export interface TextInputParameters extends BaseInputParameters {
	readonly type: 'textInput';
	readonly value?: string;
	readonly valueSelection?: [number, number];
	readonly prompt?: string;
	readonly placeHolder?: string;
	readonly password?: boolean;
	readonly validateInput?: (input: string) => TPromise<string>;
}

interface QuickInputUI {
	checkAll: HTMLInputElement;
	inputBox: QuickInputBox;
	count: CountBadge;
	message: HTMLElement;
	checkboxList: QuickInputCheckboxList;
}

interface InputController<R> {
	readonly showUI: { [k in keyof QuickInputUI]?: boolean; } & { ok?: boolean; };
	readonly result: TPromise<R>;
	readonly ready: TPromise<void>;
	readonly resolve: (ok?: true | Thenable<never>) => void | TPromise<void>;
}

class SelectManyController<T extends IPickOpenEntry> implements InputController<T[]> {
	public showUI = { checkAll: true, inputBox: true, count: true, ok: true, checkboxList: true };
	public result: TPromise<T[]>;
	public ready: TPromise<void>;
	public resolve: (ok?: true | Thenable<never>) => void;
	public progress: (value: T) => void;
	private closed = false;

	constructor(ui: QuickInputUI, parameters: SelectManyParameters<T>) {
		this.result = new TPromise<T[]>((resolve, reject, progress) => {
			this.resolve = ok => resolve(ok === true ? <T[]>ui.checkboxList.getCheckedElements() : ok);
			this.progress = progress;
		});
		this.result.then(() => this.closed = true, () => this.closed = true);

		ui.inputBox.value = '';
		ui.inputBox.setPlaceholder(parameters.placeHolder || '');
		ui.checkboxList.matchOnDescription = parameters.matchOnDescription;
		ui.checkboxList.matchOnDetail = parameters.matchOnDetail;
		ui.checkboxList.setElements([]);
		ui.checkAll.checked = ui.checkboxList.getAllVisibleChecked();
		ui.count.setCount(ui.checkboxList.getCheckedCount());

		this.ready = parameters.picks.then(elements => {
			if (this.closed) {
				return;
			}

			ui.checkboxList.setElements(elements);
			ui.checkboxList.filter(ui.inputBox.value);
			ui.checkAll.checked = ui.checkboxList.getAllVisibleChecked();
			ui.count.setCount(ui.checkboxList.getCheckedCount());
		});
	}
}

class TextInputController implements InputController<string> {
	public showUI = { inputBox: true, message: true };
	public result: TPromise<string>;
	public ready = TPromise.as(null);
	public resolveResult: (string) => void;
	private validationValue: string;
	private validation: TPromise<string>;
	private defaultMessage: string;
	private disposables: IDisposable[] = [];

	constructor(private ui: QuickInputUI, private parameters: TextInputParameters) {
		this.result = new TPromise<string>((resolve, reject, progress) => {
			this.resolveResult = resolve;
		});
		this.result.then(() => this.dispose());

		ui.inputBox.value = parameters.value || '';
		const selection = parameters.valueSelection;
		ui.inputBox.select(selection && { start: selection[0], end: selection[1] });
		ui.inputBox.setPlaceholder(parameters.placeHolder || '');
		this.defaultMessage = parameters.prompt
			? localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", parameters.prompt)
			: localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel");
		ui.message.textContent = this.defaultMessage;
		ui.inputBox.setPassword(parameters.password);

		if (parameters.validateInput) {
			const onDidChange = debounceEvent(ui.inputBox.onDidChange, (last, cur) => cur, 100);
			this.disposables.push(onDidChange(() => this.didChange()));
			if (ui.inputBox.value) {
				// Replicating old behavior: only fire if value is not empty.
				this.didChange();
			}
		}
	}

	didChange() {
		this.updatedValidation()
			.then(validationError => {
				this.ui.message.textContent = validationError || this.defaultMessage;
				this.ui.inputBox.showDecoration(validationError ? Severity.Error : Severity.Ignore);
			})
			.then(null, onUnexpectedError);
	}

	resolve(ok?: true | Thenable<never>) {
		if (ok === true) {
			return this.updatedValidation()
				.then(validationError => {
					if (validationError) {
						throw canceled();
					}
					this.resolveResult(this.ui.inputBox.value);
				});
		} else {
			this.resolveResult(ok);
		}
		return null;
	}

	private updatedValidation() {
		if (this.parameters.validateInput) {
			const value = this.ui.inputBox.value;
			if (value !== this.validationValue) {
				this.validationValue = value;
				this.validation = this.parameters.validateInput(value)
					.then(validationError => {
						if (this.validationValue !== value) {
							throw canceled();
						}
						return validationError;
					});
			}
		} else if (!this.validation) {
			this.validation = TPromise.as(null);
		}
		return this.validation;
	}

	private dispose() {
		this.disposables = dispose(this.disposables);
	}
}

export class QuickInputService extends Component implements IQuickInputService {

	public _serviceBrand: any;

	private static readonly ID = 'workbench.component.quickinput';
	private static readonly MAX_WIDTH = 600; // Max total width of quick open widget

	private layoutDimensions: dom.Dimension;
	private container: HTMLElement;
	private filterContainer: HTMLElement;
	private countContainer: HTMLElement;
	private okContainer: HTMLElement;
	private ui: QuickInputUI;
	private ready = false;
	private progressBar: ProgressBar;
	private ignoreFocusLost = false;

	private controller: InputController<any>;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickInputService.ID, themeService);
	}

	private create() {
		if (this.container) {
			return;
		}

		const workbench = document.getElementById(this.partService.getWorkbenchElementId());
		this.container = dom.append(workbench, $('.quick-input-widget'));
		this.container.tabIndex = -1;
		this.container.style.display = 'none';

		const headerContainer = dom.append(this.container, $('.quick-input-header'));

		const checkAll = <HTMLInputElement>dom.append(headerContainer, $('input.quick-input-check-all'));
		checkAll.type = 'checkbox';
		this.toUnbind.push(dom.addStandardDisposableListener(checkAll, dom.EventType.CHANGE, e => {
			const checked = checkAll.checked;
			checkboxList.setAllVisibleChecked(checked);
		}));
		this.toUnbind.push(dom.addDisposableListener(checkAll, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space'...
				inputBox.setFocus();
			}
		}));

		this.filterContainer = dom.append(headerContainer, $('.quick-input-filter'));

		const inputBox = new QuickInputBox(this.filterContainer);
		this.toUnbind.push(inputBox);
		inputBox.onDidChange(value => {
			checkboxList.filter(value);
		});
		this.toUnbind.push(inputBox.onKeyDown(event => {
			if (!checkboxList.isDisplayed()) {
				return;
			}
			switch (event.keyCode) {
				case KeyCode.DownArrow:
					checkboxList.focus('First');
					checkboxList.domFocus();
					break;
				case KeyCode.UpArrow:
					checkboxList.focus('Last');
					checkboxList.domFocus();
					break;
			}
		}));

		this.countContainer = dom.append(this.filterContainer, $('.quick-input-count'));
		const count = new CountBadge(this.countContainer, { countFormat: localize('quickInput.countSelected', "{0} Selected") });
		this.toUnbind.push(attachBadgeStyler(count, this.themeService));

		this.okContainer = dom.append(headerContainer, $('.quick-input-action'));
		const ok = new Button(this.okContainer);
		attachButtonStyler(ok, this.themeService);
		ok.label = localize('ok', "OK");
		this.toUnbind.push(ok.onDidClick(e => {
			if (this.ready) {
				this.close(true);
			}
		}));

		const message = dom.append(this.container, $('.quick-input-message'));

		this.progressBar = new ProgressBar(this.container);
		dom.addClass(this.progressBar.getContainer(), 'quick-input-progress');
		this.toUnbind.push(attachProgressBarStyler(this.progressBar, this.themeService));

		const checkboxList = this.instantiationService.createInstance(QuickInputCheckboxList, this.container);
		this.toUnbind.push(checkboxList);
		this.toUnbind.push(checkboxList.onAllVisibleCheckedChanged(checked => {
			checkAll.checked = checked;
		}));
		this.toUnbind.push(checkboxList.onCheckedCountChanged(c => {
			count.setCount(c);
		}));
		this.toUnbind.push(checkboxList.onLeave(() => {
			// Defer to avoid the input field reacting to the triggering key.
			setTimeout(() => {
				inputBox.setFocus();
				checkboxList.clearFocus();
			}, 0);
		}));
		this.toUnbind.push(
			chain(checkboxList.onFocusChange)
				.map(e => e[0])
				.filter(e => !!e)
				.latch()
				.on(e => this.controller instanceof SelectManyController && this.controller.progress(e)) // TODO
		);

		this.toUnbind.push(dom.addDisposableListener(this.container, 'focusout', (e: FocusEvent) => {
			if (e.relatedTarget === this.container) {
				(<HTMLElement>e.target).focus();
				return;
			}
			for (let element = <Element>e.relatedTarget; element; element = element.parentElement) {
				if (element === this.container) {
					return;
				}
			}
			if (!this.ignoreFocusLost && !this.environmentService.args['sticky-quickopen'] && this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG)) {
				this.close(undefined, true);
			}
		}));
		this.toUnbind.push(dom.addDisposableListener(this.container, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Enter:
					if (this.ready) {
						dom.EventHelper.stop(e, true);
						this.close(true);
					}
					break;
				case KeyCode.Escape:
					dom.EventHelper.stop(e, true);
					this.close();
					break;
				case KeyCode.Tab:
					if (!event.altKey && !event.ctrlKey && !event.metaKey) {
						const inputs = this.container.querySelectorAll('input');
						if (event.shiftKey && event.target === inputs[0]) {
							dom.EventHelper.stop(e, true);
							inputs[inputs.length - 1].focus();
						} else if (!event.shiftKey && event.target === inputs[inputs.length - 1]) {
							dom.EventHelper.stop(e, true);
							inputs[0].focus();
						}
					}
					break;
			}
		}));

		this.toUnbind.push(this.quickOpenService.onShow(() => this.close()));

		this.ui = { checkAll, inputBox, count, message, checkboxList };
		this.updateStyles();
	}

	private close(ok?: true | Thenable<never>, focusLost?: boolean) {
		if (!this.container || this.container.style.display === 'none') {
			return TPromise.as(undefined);
		}
		if (this.controller) {
			const resolved = this.controller.resolve(ok);
			if (resolved) {
				const result = resolved
					.then(() => {
						this.container.style.display = 'none';
						if (!focusLost) {
							this.restoreFocus();
						}
					});
				result.then(null, onUnexpectedError);
				return result;
			}
		}
		this.container.style.display = 'none';
		if (!focusLost) {
			this.restoreFocus();
		}
		return TPromise.as(undefined);
	}

	private restoreFocus(): void {
		const editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}
	}

	pick<T extends IPickOpenEntry>(picks: TPromise<T[]>, options: IPickOptions = {}, token?: CancellationToken): TPromise<T[]> {
		return this.show({
			type: 'selectMany',
			picks,
			placeHolder: options.placeHolder,
			matchOnDescription: options.matchOnDescription,
			matchOnDetail: options.matchOnDetail,
			ignoreFocusLost: options.ignoreFocusLost
		}, token);
	}

	input(options: IInputOptions = {}, token?: CancellationToken): TPromise<string> {
		return this.show({
			type: 'textInput',
			value: options.value,
			valueSelection: options.valueSelection,
			prompt: options.prompt,
			placeHolder: options.placeHolder,
			password: options.password,
			ignoreFocusLost: options.ignoreFocusLost,
			validateInput: options.validateInput,
		}, token);
	}

	show<T extends IPickOpenEntry>(parameters: SelectManyParameters<T>, token?: CancellationToken): TPromise<T[]>;
	show(parameters: TextInputParameters, token?: CancellationToken): TPromise<string>;
	show<R>(parameters: InputParameters, token: CancellationToken = CancellationToken.None): TPromise<R> {
		this.create();
		this.quickOpenService.close();
		if (this.controller) {
			this.controller.resolve();
		}

		this.container.setAttribute('data-type', parameters.type);

		this.ignoreFocusLost = parameters.ignoreFocusLost;

		this.progressBar.stop();
		this.ready = false;

		this.controller = parameters.type === 'selectMany' ? new SelectManyController(this.ui, parameters) : new TextInputController(this.ui, parameters);
		this.ui.checkAll.style.display = this.controller.showUI.checkAll ? null : 'none';
		this.filterContainer.style.display = this.controller.showUI.inputBox ? null : 'none';
		this.ui.inputBox.showDecoration(Severity.Ignore);
		this.countContainer.style.display = this.controller.showUI.count ? null : 'none';
		this.okContainer.style.display = this.controller.showUI.ok ? null : 'none';
		this.ui.message.style.display = this.controller.showUI.message ? null : 'none';
		this.ui.checkboxList.display(this.controller.showUI.checkboxList);

		this.container.style.display = null;
		this.updateLayout();
		this.ui.inputBox.setFocus();

		const d = token.onCancellationRequested(() => this.close());
		this.controller.result.then(() => d.dispose(), () => d.dispose());

		const delay = TPromise.timeout(800);
		delay.then(() => this.progressBar.infinite(), () => { /* ignore */ });

		const wasController = this.controller;
		this.controller.ready.then(() => {
			delay.cancel();
			if (this.controller !== wasController) {
				return;
			}

			this.progressBar.stop();
			this.ready = true;

			this.updateLayout();
		}).then(null, reason => this.close(TPromise.wrapError(reason)));

		return this.controller.result;
	}

	focus() {
		if (this.ui) {
			this.ui.inputBox.setFocus();
		}
	}

	accept() {
		return this.close(true);
	}

	cancel() {
		return this.close();
	}

	layout(dimension: dom.Dimension): void {
		this.layoutDimensions = dimension;
		this.updateLayout();
	}

	private updateLayout() {
		if (this.layoutDimensions && this.container) {
			const titlebarOffset = this.partService.getTitleBarOffset();
			this.container.style.top = `${titlebarOffset}px`;

			const style = this.container.style;
			const width = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickInputService.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.ui.inputBox.layout();
			this.ui.checkboxList.layout();
		}
	}

	protected updateStyles() {
		const theme = this.themeService.getTheme();
		if (this.ui) {
			this.ui.inputBox.style(theme);
		}
		if (this.container) {
			const sideBarBackground = theme.getColor(SIDE_BAR_BACKGROUND);
			this.container.style.backgroundColor = sideBarBackground ? sideBarBackground.toString() : undefined;
			const sideBarForeground = theme.getColor(SIDE_BAR_FOREGROUND);
			this.container.style.color = sideBarForeground ? sideBarForeground.toString() : undefined;
			const contrastBorderColor = theme.getColor(contrastBorder);
			this.container.style.border = contrastBorderColor ? `1px solid ${contrastBorderColor}` : undefined;
			const widgetShadowColor = theme.getColor(widgetShadow);
			this.container.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : undefined;
		}
	}
}
