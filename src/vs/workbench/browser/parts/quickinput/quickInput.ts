/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./quickInput';
import { Component } from 'vs/workbench/common/component';
import { IQuickInputService, IPickOpenEntry, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickInput } from 'vs/platform/quickinput/common/quickInput';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND } from 'vs/workbench/common/theme';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { QuickInputList } from './quickInputList';
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
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Action } from 'vs/base/common/actions';

const $ = dom.$;

type InputParameters = PickOneParameters | PickManyParameters | TextInputParameters;

export interface BaseInputParameters {
	readonly type: 'pickOne' | 'pickMany' | 'textInput';
	readonly ignoreFocusLost?: boolean;
}

export interface PickParameters<T extends IPickOpenEntry = IPickOpenEntry> extends BaseInputParameters {
	readonly type: 'pickOne' | 'pickMany';
	readonly picks: TPromise<T[]>;
	readonly matchOnDescription?: boolean;
	readonly matchOnDetail?: boolean;
	readonly placeHolder?: string;
}

export interface PickOneParameters<T extends IPickOpenEntry = IPickOpenEntry> extends PickParameters<T> {
	readonly type: 'pickOne';
}

export interface PickManyParameters<T extends IPickOpenEntry = IPickOpenEntry> extends PickParameters<T> {
	readonly type: 'pickMany';
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
	container: HTMLElement;
	checkAll: HTMLInputElement;
	inputBox: QuickInputBox;
	count: CountBadge;
	message: HTMLElement;
	list: QuickInputList;
	close: (ok?: true | Thenable<never>) => void;
}

interface InputController<R> {
	readonly showUI: { [k in keyof QuickInputUI]?: boolean; } & { ok?: boolean; };
	readonly result: TPromise<R>;
	readonly ready: TPromise<void>;
	readonly resolve: (ok?: true | Thenable<never>) => void | TPromise<void>;
}

class PickOneController<T extends IPickOpenEntry> implements InputController<T> {
	public showUI = { inputBox: true, list: true };
	public result: TPromise<T>;
	public ready: TPromise<void>;
	public resolve: (ok?: true | Thenable<never>) => void;
	public progress: (value: T) => void;
	private closed = false;
	private quickNavigate = false;
	private disposables: IDisposable[] = [];

	constructor(private ui: QuickInputUI, parameters: PickOneParameters<T>) {
		this.result = new TPromise<T>((resolve, reject, progress) => {
			this.resolve = ok => resolve(ok === true ? <T>ui.list.getFocusedElements()[0] : ok);
			this.progress = progress;
		});
		this.result.then(() => this.dispose());

		ui.inputBox.value = '';
		ui.inputBox.setPlaceholder(parameters.placeHolder || '');
		ui.list.matchOnDescription = parameters.matchOnDescription;
		ui.list.matchOnDetail = parameters.matchOnDetail;
		ui.list.setElements([]);

		this.ready = parameters.picks.then(elements => {
			if (this.closed) {
				return;
			}

			ui.list.setElements(elements);
			ui.list.filter(ui.inputBox.value);
			ui.list.focus('First');

			this.disposables.push(
				ui.list.onSelectionChange(elements => {
					if (elements[0]) {
						ui.close(true);
					}
				}),
				ui.inputBox.onDidChange(value => {
					ui.list.filter(value);
					ui.list.focus('First');
				}),
				ui.inputBox.onKeyDown(event => {
					switch (event.keyCode) {
						case KeyCode.DownArrow:
							ui.list.focus('Next');
							break;
						case KeyCode.UpArrow:
							ui.list.focus('Previous');
							break;
					}
				})
			);
		});
	}

	configureQuickNavigate(quickNavigate: IQuickNavigateConfiguration) {
		if (this.quickNavigate) {
			return;
		}
		this.quickNavigate = true;

		this.disposables.push(dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e as KeyboardEvent);
			const keyCode = keyboardEvent.keyCode;

			// Select element when keys are pressed that signal it
			const quickNavKeys = quickNavigate.keybindings;
			const wasTriggerKeyPressed = keyCode === KeyCode.Enter || quickNavKeys.some(k => {
				const [firstPart, chordPart] = k.getParts();
				if (chordPart) {
					return false;
				}

				if (firstPart.shiftKey && keyCode === KeyCode.Shift) {
					if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
						return false; // this is an optimistic check for the shift key being used to navigate back in quick open
					}

					return true;
				}

				if (firstPart.altKey && keyCode === KeyCode.Alt) {
					return true;
				}

				if (firstPart.ctrlKey && keyCode === KeyCode.Ctrl) {
					return true;
				}

				if (firstPart.metaKey && keyCode === KeyCode.Meta) {
					return true;
				}

				return false;
			});

			if (wasTriggerKeyPressed) {
				this.ui.close(true);
			}
		}));
	}

	private dispose() {
		this.closed = true;
		this.disposables = dispose(this.disposables);
	}
}

class PickManyController<T extends IPickOpenEntry> implements InputController<T[]> {
	public showUI = { checkAll: true, inputBox: true, count: true, ok: true, list: true };
	public result: TPromise<T[]>;
	public ready: TPromise<void>;
	public resolve: (ok?: true | Thenable<never>) => void;
	public progress: (value: T) => void;
	private closed = false;
	private disposables: IDisposable[] = [];

	constructor(ui: QuickInputUI, parameters: PickManyParameters<T>) {
		this.result = new TPromise<T[]>((resolve, reject, progress) => {
			this.resolve = ok => resolve(ok === true ? <T[]>ui.list.getCheckedElements() : ok);
			this.progress = progress;
		});
		this.result.then(() => this.dispose());

		ui.inputBox.value = '';
		ui.inputBox.setPlaceholder(parameters.placeHolder || '');
		ui.list.matchOnDescription = parameters.matchOnDescription;
		ui.list.matchOnDetail = parameters.matchOnDetail;
		ui.list.setElements([]);
		ui.checkAll.checked = ui.list.getAllVisibleChecked();
		ui.count.setCount(ui.list.getCheckedCount());

		this.ready = parameters.picks.then(elements => {
			if (this.closed) {
				return;
			}

			ui.list.setElements(elements, true);
			ui.list.filter(ui.inputBox.value);
			ui.checkAll.checked = ui.list.getAllVisibleChecked();
			ui.count.setCount(ui.list.getCheckedCount());

			this.disposables.push(
				ui.inputBox.onDidChange(value => {
					ui.list.filter(value);
				}),
				ui.inputBox.onKeyDown(event => {
					switch (event.keyCode) {
						case KeyCode.DownArrow:
							ui.list.focus('First');
							ui.list.domFocus();
							break;
						case KeyCode.UpArrow:
							ui.list.focus('Last');
							ui.list.domFocus();
							break;
					}
				})
			);
		});
	}

	private dispose() {
		this.closed = true;
		this.disposables = dispose(this.disposables);
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
	private filterContainer: HTMLElement;
	private countContainer: HTMLElement;
	private okContainer: HTMLElement;
	private ui: QuickInputUI;
	private ready = false;
	private progressBar: ProgressBar;
	private ignoreFocusLost = false;
	private inQuickOpenWidgets: Record<string, boolean> = {};
	private inQuickOpenContext: IContextKey<boolean>;

	private controller: InputController<any>;
	private multiStepHandle: CancellationTokenSource;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService
	) {
		super(QuickInputService.ID, themeService);
		this.inQuickOpenContext = new RawContextKey<boolean>('inQuickOpen', false).bindTo(contextKeyService);
		this.toUnbind.push(this.quickOpenService.onShow(() => this.inQuickOpen('quickOpen', true)));
		this.toUnbind.push(this.quickOpenService.onHide(() => this.inQuickOpen('quickOpen', false)));
	}

	private inQuickOpen(widget: 'quickInput' | 'quickOpen', open: boolean) {
		if (open) {
			this.inQuickOpenWidgets[widget] = true;
		} else {
			delete this.inQuickOpenWidgets[widget];
		}
		if (Object.keys(this.inQuickOpenWidgets).length) {
			if (!this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.set(true);
			}
		} else {
			if (this.inQuickOpenContext.get()) {
				this.inQuickOpenContext.reset();
			}
		}
	}

	private create() {
		if (this.ui) {
			return;
		}

		const workbench = document.getElementById(this.partService.getWorkbenchElementId());
		const container = dom.append(workbench, $('.quick-input-widget'));
		container.tabIndex = -1;
		container.style.display = 'none';

		const headerContainer = dom.append(container, $('.quick-input-header'));

		const checkAll = <HTMLInputElement>dom.append(headerContainer, $('input.quick-input-check-all'));
		checkAll.type = 'checkbox';
		this.toUnbind.push(dom.addStandardDisposableListener(checkAll, dom.EventType.CHANGE, e => {
			const checked = checkAll.checked;
			list.setAllVisibleChecked(checked);
		}));
		this.toUnbind.push(dom.addDisposableListener(checkAll, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space'...
				inputBox.setFocus();
			}
		}));

		this.filterContainer = dom.append(headerContainer, $('.quick-input-filter'));

		const inputBox = new QuickInputBox(this.filterContainer);
		this.toUnbind.push(inputBox);

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

		const message = dom.append(container, $('.quick-input-message'));

		this.progressBar = new ProgressBar(container);
		dom.addClass(this.progressBar.getContainer(), 'quick-input-progress');
		this.toUnbind.push(attachProgressBarStyler(this.progressBar, this.themeService));

		const list = this.instantiationService.createInstance(QuickInputList, container);
		this.toUnbind.push(list);
		this.toUnbind.push(list.onAllVisibleCheckedChanged(checked => {
			checkAll.checked = checked;
		}));
		this.toUnbind.push(list.onCheckedCountChanged(c => {
			count.setCount(c);
		}));
		this.toUnbind.push(list.onLeave(() => {
			// Defer to avoid the input field reacting to the triggering key.
			setTimeout(() => {
				inputBox.setFocus();
				list.clearFocus();
			}, 0);
		}));
		this.toUnbind.push(
			chain(list.onFocusChange)
				.map(e => e[0])
				.filter(e => !!e)
				.latch()
				.on(e => {
					// TODO
					if (this.controller instanceof PickOneController || this.controller instanceof PickManyController) {
						this.controller.progress(e);
					}
				})
		);

		this.toUnbind.push(dom.addDisposableListener(container, 'focusout', (e: FocusEvent) => {
			if (e.relatedTarget === container) {
				(<HTMLElement>e.target).focus();
				return;
			}
			for (let element = <Element>e.relatedTarget; element; element = element.parentElement) {
				if (element === container) {
					return;
				}
			}
			if (!this.ignoreFocusLost && !this.environmentService.args['sticky-quickopen'] && this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG)) {
				this.close(undefined, true);
			}
		}));
		this.toUnbind.push(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
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
						const inputs = [].slice.call(container.querySelectorAll('input'))
							.filter(input => input.style.display !== 'none');
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

		this.ui = { container, checkAll, inputBox, count, message, list, close: ok => this.close(ok) };
		this.updateStyles();
	}

	private close(ok?: true | Thenable<never>, focusLost?: boolean) {
		if (!this.isDisplayed()) {
			return TPromise.as(undefined);
		}
		if (this.controller) {
			const resolved = this.controller.resolve(ok);
			if (resolved) {
				const result = resolved
					.then(() => {
						this.inQuickOpen('quickInput', false);
						this.ui.container.style.display = 'none';
						if (!focusLost) {
							this.restoreFocus();
						}
					});
				result.then(null, onUnexpectedError);
				return result;
			}
		}
		this.inQuickOpen('quickInput', false);
		this.ui.container.style.display = 'none';
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

	pick<T extends IPickOpenEntry, O extends IPickOptions>(picks: TPromise<T[]>, options: O = <O>{}, token?: CancellationToken): TPromise<O extends { canPickMany: true } ? T[] : T> {
		return this._pick(undefined, picks, options, token);
	}

	private _pick<T extends IPickOpenEntry, O extends IPickOptions>(handle: CancellationTokenSource | undefined, picks: TPromise<T[]>, options: O = <O>{}, token?: CancellationToken): TPromise<O extends { canPickMany: true } ? T[] : T> {
		return <any>this._show(handle, <any>{
			type: options.canPickMany ? 'pickMany' : 'pickOne',
			picks,
			placeHolder: options.placeHolder,
			matchOnDescription: options.matchOnDescription,
			matchOnDetail: options.matchOnDetail,
			ignoreFocusLost: options.ignoreFocusLost
		}, token);
	}

	input(options: IInputOptions = {}, token?: CancellationToken): TPromise<string> {
		return this._input(undefined, options, token);
	}

	private _input(handle: CancellationTokenSource | undefined, options: IInputOptions = {}, token?: CancellationToken): TPromise<string> {
		return this._show(handle, {
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

	private _show<T extends IPickOpenEntry, P extends PickOneParameters<T> | PickManyParameters<T>>(multiStepHandle: CancellationTokenSource | undefined, parameters: P, token?: CancellationToken): TPromise<P extends PickManyParameters<T> ? T[] : T>;
	private _show(multiStepHandle: CancellationTokenSource | undefined, parameters: TextInputParameters, token?: CancellationToken): TPromise<string>;
	private _show<R>(multiStepHandle: CancellationTokenSource | undefined, parameters: InputParameters, token: CancellationToken = CancellationToken.None): TPromise<R> {
		if (multiStepHandle && multiStepHandle !== this.multiStepHandle) {
			multiStepHandle.cancel();
			return TPromise.as(undefined);
		}
		if (!multiStepHandle && this.multiStepHandle) {
			this.multiStepHandle.cancel();
		}

		this.create();
		this.quickOpenService.close();
		if (this.controller) {
			this.controller.resolve();
		}

		this.ui.container.setAttribute('data-type', parameters.type);

		this.ignoreFocusLost = parameters.ignoreFocusLost;

		this.progressBar.stop();
		this.ready = false;

		this.controller = this.createController(parameters);
		this.ui.checkAll.style.display = this.controller.showUI.checkAll ? '' : 'none';
		this.filterContainer.style.display = this.controller.showUI.inputBox ? '' : 'none';
		this.ui.inputBox.showDecoration(Severity.Ignore);
		this.countContainer.style.display = this.controller.showUI.count ? '' : 'none';
		this.okContainer.style.display = this.controller.showUI.ok ? '' : 'none';
		this.ui.message.style.display = this.controller.showUI.message ? '' : 'none';
		this.ui.list.display(this.controller.showUI.list);

		if (this.ui.container.style.display === 'none') {
			this.inQuickOpen('quickInput', true);
		}
		this.ui.container.style.display = '';
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

	private createController(parameters: InputParameters) {
		switch (parameters.type) {
			case 'pickOne': return new PickOneController(this.ui, parameters);
			case 'pickMany': return new PickManyController(this.ui, parameters);
			case 'textInput': return new TextInputController(this.ui, parameters);
			default: ((p: never) => {
				throw new Error(`Unknown input type: ${(<any>p).type}`);
			})(parameters);
		}
	}

	multiStepInput<T>(handler: (input: IQuickInput, token: CancellationToken) => Thenable<T>, token = CancellationToken.None): Thenable<T> {
		if (this.multiStepHandle) {
			this.multiStepHandle.cancel();
		}
		this.multiStepHandle = new CancellationTokenSource();
		return TPromise.wrap(handler({
			pick: this._pick.bind(this, this.multiStepHandle),
			input: this._input.bind(this, this.multiStepHandle)
		}, this.multiStepHandle.token));
	}

	focus() {
		if (this.isDisplayed()) {
			this.ui.inputBox.setFocus();
		}
	}

	toggle() {
		if (this.isDisplayed() && this.controller instanceof PickManyController) {
			this.ui.list.toggleCheckbox();
		}
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration) {
		if (this.isDisplayed() && this.ui.list.isDisplayed()) {
			this.ui.list.focus(next ? 'Next' : 'Previous');
			if (quickNavigate && this.controller instanceof PickOneController) {
				this.controller.configureQuickNavigate(quickNavigate);
			}
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
		if (this.layoutDimensions && this.ui) {
			const titlebarOffset = this.partService.getTitleBarOffset();
			this.ui.container.style.top = `${titlebarOffset}px`;

			const style = this.ui.container.style;
			const width = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickInputService.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.ui.inputBox.layout();
			this.ui.list.layout();
		}
	}

	protected updateStyles() {
		const theme = this.themeService.getTheme();
		if (this.ui) {
			this.ui.inputBox.style(theme);
		}
		if (this.ui) {
			const sideBarBackground = theme.getColor(SIDE_BAR_BACKGROUND);
			this.ui.container.style.backgroundColor = sideBarBackground ? sideBarBackground.toString() : undefined;
			const sideBarForeground = theme.getColor(SIDE_BAR_FOREGROUND);
			this.ui.container.style.color = sideBarForeground ? sideBarForeground.toString() : undefined;
			const contrastBorderColor = theme.getColor(contrastBorder);
			this.ui.container.style.border = contrastBorderColor ? `1px solid ${contrastBorderColor}` : undefined;
			const widgetShadowColor = theme.getColor(widgetShadow);
			this.ui.container.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : undefined;
		}
	}

	private isDisplayed() {
		return this.ui && this.ui.container.style.display !== 'none';
	}
}

export class QuickPickManyToggleAction extends Action {

	public static readonly ID = 'workbench.action.quickPickManyToggle';
	public static readonly LABEL = localize('quickPickManyToggle', "Toggle Selection in Quick Pick");

	constructor(
		id: string,
		label: string,
		@IQuickInputService private quickInputService: IQuickInputService
	) {
		super(id, label);
	}

	public run(event?: any): TPromise<any> {
		this.quickInputService.toggle();
		return TPromise.as(true);
	}
}
