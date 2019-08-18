/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/quickInput';
import { Component } from 'vs/workbench/common/component';
import { IQuickInputService, IQuickPickItem, IPickOptions, IInputOptions, IQuickNavigateConfiguration, IQuickPick, IQuickInput, IQuickInputButton, IInputBox, IQuickPickItemButtonEvent, QuickPickInput, IQuickPickSeparator, IKeyMods } from 'vs/platform/quickinput/common/quickInput';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import * as dom from 'vs/base/browser/dom';
import { IInstantiationService, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { contrastBorder, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { QUICK_INPUT_BACKGROUND, QUICK_INPUT_FOREGROUND } from 'vs/workbench/common/theme';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { CancellationToken } from 'vs/base/common/cancellation';
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
import { Emitter, Event } from 'vs/base/common/event';
import { Button } from 'vs/base/browser/ui/button/button';
import { dispose, Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICommandAndKeybindingRule, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { inQuickOpenContext, InQuickOpenContextKey } from 'vs/workbench/browser/parts/quickopen/quickopen';
import { ActionBar, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { Action } from 'vs/base/common/actions';
import { URI } from 'vs/base/common/uri';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { equals } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import { getIconClass } from 'vs/workbench/browser/parts/quickinput/quickInputUtils';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IAccessibilityService, AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

const $ = dom.$;

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

const backButton = {
	iconPath: {
		dark: URI.parse(require.toUrl('vs/workbench/browser/parts/quickinput/media/arrow-left-dark.svg')),
		light: URI.parse(require.toUrl('vs/workbench/browser/parts/quickinput/media/arrow-left-light.svg'))
	},
	tooltip: localize('quickInput.back', "Back"),
	handle: -1 // TODO
};

interface QuickInputUI {
	container: HTMLElement;
	leftActionBar: ActionBar;
	title: HTMLElement;
	rightActionBar: ActionBar;
	checkAll: HTMLInputElement;
	inputBox: QuickInputBox;
	visibleCount: CountBadge;
	count: CountBadge;
	message: HTMLElement;
	customButton: Button;
	progressBar: ProgressBar;
	list: QuickInputList;
	onDidAccept: Event<void>;
	onDidCustom: Event<void>;
	onDidTriggerButton: Event<IQuickInputButton>;
	ignoreFocusOut: boolean;
	keyMods: Writeable<IKeyMods>;
	isScreenReaderOptimized(): boolean;
	show(controller: QuickInput): void;
	setVisibilities(visibilities: Visibilities): void;
	setComboboxAccessibility(enabled: boolean): void;
	setEnabled(enabled: boolean): void;
	setContextKey(contextKey?: string): void;
	hide(): void;
}

type Visibilities = {
	title?: boolean;
	checkAll?: boolean;
	inputBox?: boolean;
	visibleCount?: boolean;
	count?: boolean;
	message?: boolean;
	list?: boolean;
	ok?: boolean;
	customButton?: boolean;
};

class QuickInput extends Disposable implements IQuickInput {

	private _title: string;
	private _steps: number;
	private _totalSteps: number;
	protected visible = false;
	private _enabled = true;
	private _contextKey: string;
	private _busy = false;
	private _ignoreFocusOut = false;
	private _buttons: IQuickInputButton[] = [];
	private buttonsUpdated = false;
	private readonly onDidTriggerButtonEmitter = this._register(new Emitter<IQuickInputButton>());
	private readonly onDidHideEmitter = this._register(new Emitter<void>());

	protected readonly visibleDisposables = this._register(new DisposableStore());

	private busyDelay: TimeoutTimer | null;

	constructor(
		protected ui: QuickInputUI
	) {
		super();
	}

	get title() {
		return this._title;
	}

	set title(title: string) {
		this._title = title;
		this.update();
	}

	get step() {
		return this._steps;
	}

	set step(step: number) {
		this._steps = step;
		this.update();
	}

	get totalSteps() {
		return this._totalSteps;
	}

	set totalSteps(totalSteps: number) {
		this._totalSteps = totalSteps;
		this.update();
	}

	get enabled() {
		return this._enabled;
	}

	set enabled(enabled: boolean) {
		this._enabled = enabled;
		this.update();
	}

	get contextKey() {
		return this._contextKey;
	}

	set contextKey(contextKey: string) {
		this._contextKey = contextKey;
		this.update();
	}

	get busy() {
		return this._busy;
	}

	set busy(busy: boolean) {
		this._busy = busy;
		this.update();
	}

	get ignoreFocusOut() {
		return this._ignoreFocusOut;
	}

	set ignoreFocusOut(ignoreFocusOut: boolean) {
		this._ignoreFocusOut = ignoreFocusOut;
		this.update();
	}

	get buttons() {
		return this._buttons;
	}

	set buttons(buttons: IQuickInputButton[]) {
		this._buttons = buttons;
		this.buttonsUpdated = true;
		this.update();
	}

	onDidTriggerButton = this.onDidTriggerButtonEmitter.event;

	show(): void {
		if (this.visible) {
			return;
		}
		this.visibleDisposables.add(
			this.ui.onDidTriggerButton(button => {
				if (this.buttons.indexOf(button) !== -1) {
					this.onDidTriggerButtonEmitter.fire(button);
				}
			}),
		);
		this.ui.show(this);
		this.visible = true;
		this.update();
	}

	hide(): void {
		if (!this.visible) {
			return;
		}
		this.ui.hide();
	}

	didHide(): void {
		this.visible = false;
		this.visibleDisposables.clear();
		this.onDidHideEmitter.fire();
	}

	onDidHide = this.onDidHideEmitter.event;

	protected update() {
		if (!this.visible) {
			return;
		}
		const title = this.getTitle();
		if (this.ui.title.textContent !== title) {
			this.ui.title.textContent = title;
		}
		if (this.busy && !this.busyDelay) {
			this.busyDelay = new TimeoutTimer();
			this.busyDelay.setIfNotSet(() => {
				if (this.visible) {
					this.ui.progressBar.infinite();
				}
			}, 800);
		}
		if (!this.busy && this.busyDelay) {
			this.ui.progressBar.stop();
			this.busyDelay.cancel();
			this.busyDelay = null;
		}
		if (this.buttonsUpdated) {
			this.buttonsUpdated = false;
			this.ui.leftActionBar.clear();
			const leftButtons = this.buttons.filter(button => button === backButton);
			this.ui.leftActionBar.push(leftButtons.map((button, index) => {
				const action = new Action(`id-${index}`, '', button.iconClass || getIconClass(button.iconPath), true, () => {
					this.onDidTriggerButtonEmitter.fire(button);
					return Promise.resolve(null);
				});
				action.tooltip = button.tooltip || '';
				return action;
			}), { icon: true, label: false });
			this.ui.rightActionBar.clear();
			const rightButtons = this.buttons.filter(button => button !== backButton);
			this.ui.rightActionBar.push(rightButtons.map((button, index) => {
				const action = new Action(`id-${index}`, '', button.iconClass || getIconClass(button.iconPath), true, () => {
					this.onDidTriggerButtonEmitter.fire(button);
					return Promise.resolve(null);
				});
				action.tooltip = button.tooltip || '';
				return action;
			}), { icon: true, label: false });
		}
		this.ui.ignoreFocusOut = this.ignoreFocusOut;
		this.ui.setEnabled(this.enabled);
		this.ui.setContextKey(this.contextKey);
	}

	private getTitle() {
		if (this.title && this.step) {
			return `${this.title} (${this.getSteps()})`;
		}
		if (this.title) {
			return this.title;
		}
		if (this.step) {
			return this.getSteps();
		}
		return '';
	}

	private getSteps() {
		if (this.step && this.totalSteps) {
			return localize('quickInput.steps', "{0}/{1}", this.step, this.totalSteps);
		}
		if (this.step) {
			return String(this.step);
		}
		return '';
	}

	protected showMessageDecoration(severity: Severity) {
		this.ui.inputBox.showDecoration(severity);
		if (severity === Severity.Error) {
			const styles = this.ui.inputBox.stylesForType(severity);
			this.ui.message.style.backgroundColor = styles.background ? `${styles.background}` : null;
			this.ui.message.style.border = styles.border ? `1px solid ${styles.border}` : null;
			this.ui.message.style.paddingBottom = '4px';
		} else {
			this.ui.message.style.backgroundColor = '';
			this.ui.message.style.border = '';
			this.ui.message.style.paddingBottom = '';
		}
	}

	public dispose(): void {
		this.hide();
		super.dispose();
	}
}

class QuickPick<T extends IQuickPickItem> extends QuickInput implements IQuickPick<T> {

	private static INPUT_BOX_ARIA_LABEL = localize('quickInputBox.ariaLabel', "Type to narrow down results.");

	private _value = '';
	private _placeholder: string;
	private readonly onDidChangeValueEmitter = this._register(new Emitter<string>());
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());
	private readonly onDidCustomEmitter = this._register(new Emitter<void>());
	private _items: Array<T | IQuickPickSeparator> = [];
	private itemsUpdated = false;
	private _canSelectMany = false;
	private _matchOnDescription = false;
	private _matchOnDetail = false;
	private _matchOnLabel = true;
	private _autoFocusOnList = true;
	private _activeItems: T[] = [];
	private activeItemsUpdated = false;
	private activeItemsToConfirm: T[] | null = [];
	private readonly onDidChangeActiveEmitter = this._register(new Emitter<T[]>());
	private _selectedItems: T[] = [];
	private selectedItemsUpdated = false;
	private selectedItemsToConfirm: T[] | null = [];
	private readonly onDidChangeSelectionEmitter = this._register(new Emitter<T[]>());
	private readonly onDidTriggerItemButtonEmitter = this._register(new Emitter<IQuickPickItemButtonEvent<T>>());
	private _valueSelection: Readonly<[number, number]>;
	private valueSelectionUpdated = true;
	private _validationMessage: string;
	private _ok: boolean;
	private _customButton: boolean;
	private _customButtonLabel: string;
	private _customButtonHover: string;

	quickNavigate: IQuickNavigateConfiguration;


	get value() {
		return this._value;
	}

	set value(value: string) {
		this._value = value || '';
		this.update();
	}

	get placeholder() {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this._placeholder = placeholder;
		this.update();
	}

	onDidChangeValue = this.onDidChangeValueEmitter.event;

	onDidAccept = this.onDidAcceptEmitter.event;

	onDidCustom = this.onDidCustomEmitter.event;

	get items() {
		return this._items;
	}

	set items(items: Array<T | IQuickPickSeparator>) {
		this._items = items;
		this.itemsUpdated = true;
		this.update();
	}

	get canSelectMany() {
		return this._canSelectMany;
	}

	set canSelectMany(canSelectMany: boolean) {
		this._canSelectMany = canSelectMany;
		this.update();
	}

	get matchOnDescription() {
		return this._matchOnDescription;
	}

	set matchOnDescription(matchOnDescription: boolean) {
		this._matchOnDescription = matchOnDescription;
		this.update();
	}

	get matchOnDetail() {
		return this._matchOnDetail;
	}

	set matchOnDetail(matchOnDetail: boolean) {
		this._matchOnDetail = matchOnDetail;
		this.update();
	}

	get matchOnLabel() {
		return this._matchOnLabel;
	}

	set matchOnLabel(matchOnLabel: boolean) {
		this._matchOnLabel = matchOnLabel;
		this.update();
	}

	get autoFocusOnList() {
		return this._autoFocusOnList;
	}

	set autoFocusOnList(autoFocusOnList: boolean) {
		this._autoFocusOnList = autoFocusOnList;
		this.update();
	}

	get activeItems() {
		return this._activeItems;
	}

	set activeItems(activeItems: T[]) {
		this._activeItems = activeItems;
		this.activeItemsUpdated = true;
		this.update();
	}

	onDidChangeActive = this.onDidChangeActiveEmitter.event;

	get selectedItems() {
		return this._selectedItems;
	}

	set selectedItems(selectedItems: T[]) {
		this._selectedItems = selectedItems;
		this.selectedItemsUpdated = true;
		this.update();
	}

	get keyMods() {
		return this.ui.keyMods;
	}

	set valueSelection(valueSelection: Readonly<[number, number]>) {
		this._valueSelection = valueSelection;
		this.valueSelectionUpdated = true;
		this.update();
	}

	get validationMessage() {
		return this._validationMessage;
	}

	set validationMessage(validationMessage: string) {
		this._validationMessage = validationMessage;
		this.update();
	}

	get customButton() {
		return this._customButton;
	}

	set customButton(showCustomButton: boolean) {
		this._customButton = showCustomButton;
		this.update();
	}

	get customLabel() {
		return this._customButtonLabel;
	}

	set customLabel(label: string) {
		this._customButtonLabel = label;
		this.update();
	}

	get customHover() {
		return this._customButtonHover;
	}

	set customHover(hover: string) {
		this._customButtonHover = hover;
		this.update();
	}

	get ok() {
		return this._ok;
	}

	set ok(showOkButton: boolean) {
		this._ok = showOkButton;
		this.update();
	}

	public inputHasFocus(): boolean {
		return this.visible ? this.ui.inputBox.hasFocus() : false;
	}

	onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

	onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;

	private trySelectFirst() {
		if (this.autoFocusOnList) {
			if (!this.ui.isScreenReaderOptimized() && !this.canSelectMany) {
				this.ui.list.focus('First');
			}
		}
	}

	show() {
		if (!this.visible) {
			this.visibleDisposables.add(
				this.ui.inputBox.onDidChange(value => {
					if (value === this.value) {
						return;
					}
					this._value = value;
					this.ui.list.filter(this.ui.inputBox.value);
					this.trySelectFirst();
					this.onDidChangeValueEmitter.fire(value);
				}));
			this.visibleDisposables.add(this.ui.inputBox.onMouseDown(event => {
				if (!this.autoFocusOnList) {
					this.ui.list.clearFocus();
				}
			}));
			this.visibleDisposables.add(this.ui.inputBox.onKeyDown(event => {
				switch (event.keyCode) {
					case KeyCode.DownArrow:
						this.ui.list.focus('Next');
						if (this.canSelectMany) {
							this.ui.list.domFocus();
						}
						event.preventDefault();
						break;
					case KeyCode.UpArrow:
						if (this.ui.list.getFocusedElements().length) {
							this.ui.list.focus('Previous');
						} else {
							this.ui.list.focus('Last');
						}
						if (this.canSelectMany) {
							this.ui.list.domFocus();
						}
						event.preventDefault();
						break;
					case KeyCode.PageDown:
						if (this.ui.list.getFocusedElements().length) {
							this.ui.list.focus('NextPage');
						} else {
							this.ui.list.focus('First');
						}
						if (this.canSelectMany) {
							this.ui.list.domFocus();
						}
						event.preventDefault();
						break;
					case KeyCode.PageUp:
						if (this.ui.list.getFocusedElements().length) {
							this.ui.list.focus('PreviousPage');
						} else {
							this.ui.list.focus('Last');
						}
						if (this.canSelectMany) {
							this.ui.list.domFocus();
						}
						event.preventDefault();
						break;
				}
			}));
			this.visibleDisposables.add(this.ui.onDidAccept(() => {
				if (!this.canSelectMany && this.activeItems[0]) {
					this._selectedItems = [this.activeItems[0]];
					this.onDidChangeSelectionEmitter.fire(this.selectedItems);
				}
				this.onDidAcceptEmitter.fire(undefined);
			}));
			this.visibleDisposables.add(this.ui.onDidCustom(() => {
				this.onDidCustomEmitter.fire(undefined);
			}));
			this.visibleDisposables.add(this.ui.list.onDidChangeFocus(focusedItems => {
				if (this.activeItemsUpdated) {
					return; // Expect another event.
				}
				if (this.activeItemsToConfirm !== this._activeItems && equals(focusedItems, this._activeItems, (a, b) => a === b)) {
					return;
				}
				this._activeItems = focusedItems as T[];
				this.onDidChangeActiveEmitter.fire(focusedItems as T[]);
			}));
			this.visibleDisposables.add(this.ui.list.onDidChangeSelection(selectedItems => {
				if (this.canSelectMany) {
					if (selectedItems.length) {
						this.ui.list.setSelectedElements([]);
					}
					return;
				}
				if (this.selectedItemsToConfirm !== this._selectedItems && equals(selectedItems, this._selectedItems, (a, b) => a === b)) {
					return;
				}
				this._selectedItems = selectedItems as T[];
				this.onDidChangeSelectionEmitter.fire(selectedItems as T[]);
				if (selectedItems.length) {
					this.onDidAcceptEmitter.fire(undefined);
				}
			}));
			this.visibleDisposables.add(this.ui.list.onChangedCheckedElements(checkedItems => {
				if (!this.canSelectMany) {
					return;
				}
				if (this.selectedItemsToConfirm !== this._selectedItems && equals(checkedItems, this._selectedItems, (a, b) => a === b)) {
					return;
				}
				this._selectedItems = checkedItems as T[];
				this.onDidChangeSelectionEmitter.fire(checkedItems as T[]);
			}));
			this.visibleDisposables.add(this.ui.list.onButtonTriggered(event => this.onDidTriggerItemButtonEmitter.fire(event as IQuickPickItemButtonEvent<T>)));
			this.visibleDisposables.add(this.registerQuickNavigation());
			this.valueSelectionUpdated = true;
		}
		super.show(); // TODO: Why have show() bubble up while update() trickles down? (Could move setComboboxAccessibility() here.)
	}

	private registerQuickNavigation() {
		return dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, e => {
			if (this.canSelectMany || !this.quickNavigate) {
				return;
			}

			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
			const keyCode = keyboardEvent.keyCode;

			// Select element when keys are pressed that signal it
			const quickNavKeys = this.quickNavigate.keybindings;
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

			if (wasTriggerKeyPressed && this.activeItems[0]) {
				this._selectedItems = [this.activeItems[0]];
				this.onDidChangeSelectionEmitter.fire(this.selectedItems);
				this.onDidAcceptEmitter.fire(undefined);
			}
		});
	}

	protected update() {
		super.update();
		if (!this.visible) {
			return;
		}
		if (this.ui.inputBox.value !== this.value) {
			this.ui.inputBox.value = this.value;
		}
		if (this.valueSelectionUpdated) {
			this.valueSelectionUpdated = false;
			this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
		}
		if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
			this.ui.inputBox.placeholder = (this.placeholder || '');
		}
		if (this.itemsUpdated) {
			this.itemsUpdated = false;
			this.ui.list.setElements(this.items);
			this.ui.list.filter(this.ui.inputBox.value);
			this.ui.checkAll.checked = this.ui.list.getAllVisibleChecked();
			this.ui.visibleCount.setCount(this.ui.list.getVisibleCount());
			this.ui.count.setCount(this.ui.list.getCheckedCount());
			this.trySelectFirst();
		}
		if (this.ui.container.classList.contains('show-checkboxes') !== !!this.canSelectMany) {
			if (this.canSelectMany) {
				this.ui.list.clearFocus();
			} else {
				this.trySelectFirst();
			}
		}
		if (this.activeItemsUpdated) {
			this.activeItemsUpdated = false;
			this.activeItemsToConfirm = this._activeItems;
			this.ui.list.setFocusedElements(this.activeItems);
			if (this.activeItemsToConfirm === this._activeItems) {
				this.activeItemsToConfirm = null;
			}
		}
		if (this.selectedItemsUpdated) {
			this.selectedItemsUpdated = false;
			this.selectedItemsToConfirm = this._selectedItems;
			if (this.canSelectMany) {
				this.ui.list.setCheckedElements(this.selectedItems);
			} else {
				this.ui.list.setSelectedElements(this.selectedItems);
			}
			if (this.selectedItemsToConfirm === this._selectedItems) {
				this.selectedItemsToConfirm = null;
			}
		}
		if (this.validationMessage) {
			this.ui.message.textContent = this.validationMessage;
			this.showMessageDecoration(Severity.Error);
		} else {
			this.ui.message.textContent = null;
			this.showMessageDecoration(Severity.Ignore);
		}
		this.ui.customButton.label = this.customLabel;
		this.ui.customButton.element.title = this.customHover;
		this.ui.list.matchOnDescription = this.matchOnDescription;
		this.ui.list.matchOnDetail = this.matchOnDetail;
		this.ui.list.matchOnLabel = this.matchOnLabel;
		this.ui.setComboboxAccessibility(true);
		this.ui.inputBox.setAttribute('aria-label', QuickPick.INPUT_BOX_ARIA_LABEL);
		this.ui.setVisibilities(this.canSelectMany ? { title: !!this.title || !!this.step, checkAll: true, inputBox: true, visibleCount: true, count: true, ok: true, list: true, message: !!this.validationMessage } : { title: !!this.title || !!this.step, inputBox: true, visibleCount: true, list: true, message: !!this.validationMessage, customButton: this.customButton, ok: this.ok });
	}
}

class InputBox extends QuickInput implements IInputBox {

	private static noPromptMessage = localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel");

	private _value = '';
	private _valueSelection: Readonly<[number, number]>;
	private valueSelectionUpdated = true;
	private _placeholder: string;
	private _password = false;
	private _prompt: string;
	private noValidationMessage = InputBox.noPromptMessage;
	private _validationMessage: string;
	private readonly onDidValueChangeEmitter = this._register(new Emitter<string>());
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());

	get value() {
		return this._value;
	}

	set value(value: string) {
		this._value = value || '';
		this.update();
	}

	set valueSelection(valueSelection: Readonly<[number, number]>) {
		this._valueSelection = valueSelection;
		this.valueSelectionUpdated = true;
		this.update();
	}

	get placeholder() {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this._placeholder = placeholder;
		this.update();
	}

	get password() {
		return this._password;
	}

	set password(password: boolean) {
		this._password = password;
		this.update();
	}

	get prompt() {
		return this._prompt;
	}

	set prompt(prompt: string) {
		this._prompt = prompt;
		this.noValidationMessage = prompt
			? localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", prompt)
			: InputBox.noPromptMessage;
		this.update();
	}

	get validationMessage() {
		return this._validationMessage;
	}

	set validationMessage(validationMessage: string) {
		this._validationMessage = validationMessage;
		this.update();
	}

	readonly onDidChangeValue = this.onDidValueChangeEmitter.event;

	readonly onDidAccept = this.onDidAcceptEmitter.event;

	show() {
		if (!this.visible) {
			this.visibleDisposables.add(
				this.ui.inputBox.onDidChange(value => {
					if (value === this.value) {
						return;
					}
					this._value = value;
					this.onDidValueChangeEmitter.fire(value);
				}));
			this.visibleDisposables.add(this.ui.onDidAccept(() => this.onDidAcceptEmitter.fire(undefined)));
			this.valueSelectionUpdated = true;
		}
		super.show();
	}

	protected update() {
		super.update();
		if (!this.visible) {
			return;
		}
		if (this.ui.inputBox.value !== this.value) {
			this.ui.inputBox.value = this.value;
		}
		if (this.valueSelectionUpdated) {
			this.valueSelectionUpdated = false;
			this.ui.inputBox.select(this._valueSelection && { start: this._valueSelection[0], end: this._valueSelection[1] });
		}
		if (this.ui.inputBox.placeholder !== (this.placeholder || '')) {
			this.ui.inputBox.placeholder = (this.placeholder || '');
		}
		if (this.ui.inputBox.password !== this.password) {
			this.ui.inputBox.password = this.password;
		}
		if (!this.validationMessage && this.ui.message.textContent !== this.noValidationMessage) {
			this.ui.message.textContent = this.noValidationMessage;
			this.showMessageDecoration(Severity.Ignore);
		}
		if (this.validationMessage && this.ui.message.textContent !== this.validationMessage) {
			this.ui.message.textContent = this.validationMessage;
			this.showMessageDecoration(Severity.Error);
		}
		this.ui.setVisibilities({ title: !!this.title || !!this.step, inputBox: true, message: true });
	}
}

export class QuickInputService extends Component implements IQuickInputService {

	public _serviceBrand!: ServiceIdentifier<any>;

	private static readonly ID = 'workbench.component.quickinput';
	private static readonly MAX_WIDTH = 600; // Max total width of quick open widget

	private idPrefix = 'quickInput_'; // Constant since there is still only one.
	private titleBar: HTMLElement;
	private filterContainer: HTMLElement;
	private visibleCountContainer: HTMLElement;
	private countContainer: HTMLElement;
	private okContainer: HTMLElement;
	private ok: Button;
	private customButtonContainer: HTMLElement;
	private ui: QuickInputUI;
	private comboboxAccessibility = false;
	private enabled = true;
	private inQuickOpenWidgets: Record<string, boolean> = {};
	private inQuickOpenContext: IContextKey<boolean>;
	private contexts: Map<string, IContextKey<boolean>> = new Map();
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());
	private readonly onDidCustomEmitter = this._register(new Emitter<void>());
	private readonly onDidTriggerButtonEmitter = this._register(new Emitter<IQuickInputButton>());
	private keyMods: Writeable<IKeyMods> = { ctrlCmd: false, alt: false };

	private controller: QuickInput | null = null;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IQuickOpenService private readonly quickOpenService: IQuickOpenService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(QuickInputService.ID, themeService, storageService);
		this.inQuickOpenContext = InQuickOpenContextKey.bindTo(contextKeyService);
		this._register(this.quickOpenService.onShow(() => this.inQuickOpen('quickOpen', true)));
		this._register(this.quickOpenService.onHide(() => this.inQuickOpen('quickOpen', false)));
		this._register(this.layoutService.onLayout(dimension => this.layout(dimension)));
		this.registerKeyModsListeners();
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

	private setContextKey(id?: string) {
		let key: IContextKey<boolean> | undefined;
		if (id) {
			key = this.contexts.get(id);
			if (!key) {
				key = new RawContextKey<boolean>(id, false)
					.bindTo(this.contextKeyService);
				this.contexts.set(id, key);
			}
		}

		if (key && key.get()) {
			return; // already active context
		}

		this.resetContextKeys();

		if (key) {
			key.set(true);
		}
	}

	private resetContextKeys() {
		this.contexts.forEach(context => {
			if (context.get()) {
				context.reset();
			}
		});
	}

	private registerKeyModsListeners() {
		const workbench = this.layoutService.getWorkbenchElement();
		this._register(dom.addDisposableListener(workbench, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Ctrl:
				case KeyCode.Meta:
					this.keyMods.ctrlCmd = true;
					break;
				case KeyCode.Alt:
					this.keyMods.alt = true;
					break;
			}
		}));
		this._register(dom.addDisposableListener(workbench, dom.EventType.KEY_UP, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Ctrl:
				case KeyCode.Meta:
					this.keyMods.ctrlCmd = false;
					break;
				case KeyCode.Alt:
					this.keyMods.alt = false;
					break;
			}
		}));
	}

	private create() {
		if (this.ui) {
			return;
		}

		const workbench = this.layoutService.getWorkbenchElement();
		const container = dom.append(workbench, $('.quick-input-widget.show-file-icons'));
		container.tabIndex = -1;
		container.style.display = 'none';

		this.titleBar = dom.append(container, $('.quick-input-titlebar'));

		const leftActionBar = this._register(new ActionBar(this.titleBar));
		leftActionBar.domNode.classList.add('quick-input-left-action-bar');

		const title = dom.append(this.titleBar, $('.quick-input-title'));

		const rightActionBar = this._register(new ActionBar(this.titleBar));
		rightActionBar.domNode.classList.add('quick-input-right-action-bar');

		const headerContainer = dom.append(container, $('.quick-input-header'));

		const checkAll = <HTMLInputElement>dom.append(headerContainer, $('input.quick-input-check-all'));
		checkAll.type = 'checkbox';
		this._register(dom.addStandardDisposableListener(checkAll, dom.EventType.CHANGE, e => {
			const checked = checkAll.checked;
			list.setAllVisibleChecked(checked);
		}));
		this._register(dom.addDisposableListener(checkAll, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space'...
				inputBox.setFocus();
			}
		}));

		const extraContainer = dom.append(headerContainer, $('.quick-input-and-message'));
		this.filterContainer = dom.append(extraContainer, $('.quick-input-filter'));

		const inputBox = this._register(new QuickInputBox(this.filterContainer));
		inputBox.setAttribute('aria-describedby', `${this.idPrefix}message`);

		this.visibleCountContainer = dom.append(this.filterContainer, $('.quick-input-visible-count'));
		this.visibleCountContainer.setAttribute('aria-live', 'polite');
		this.visibleCountContainer.setAttribute('aria-atomic', 'true');
		const visibleCount = new CountBadge(this.visibleCountContainer, { countFormat: localize({ key: 'quickInput.visibleCount', comment: ['This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers.'] }, "{0} Results") });

		this.countContainer = dom.append(this.filterContainer, $('.quick-input-count'));
		this.countContainer.setAttribute('aria-live', 'polite');
		const count = new CountBadge(this.countContainer, { countFormat: localize({ key: 'quickInput.countSelected', comment: ['This tells the user how many items are selected in a list of items to select from. The items can be anything.'] }, "{0} Selected") });
		this._register(attachBadgeStyler(count, this.themeService));

		this.okContainer = dom.append(headerContainer, $('.quick-input-action'));
		this.ok = new Button(this.okContainer);
		attachButtonStyler(this.ok, this.themeService);
		this.ok.label = localize('ok', "OK");
		this._register(this.ok.onDidClick(e => {
			this.onDidAcceptEmitter.fire();
		}));

		this.customButtonContainer = dom.append(headerContainer, $('.quick-input-action'));
		const customButton = new Button(this.customButtonContainer);
		attachButtonStyler(customButton, this.themeService);
		customButton.label = localize('custom', "Custom");
		this._register(customButton.onDidClick(e => {
			this.onDidCustomEmitter.fire();
		}));

		const message = dom.append(extraContainer, $(`#${this.idPrefix}message.quick-input-message`));

		const progressBar = new ProgressBar(container);
		dom.addClass(progressBar.getContainer(), 'quick-input-progress');
		this._register(attachProgressBarStyler(progressBar, this.themeService));

		const list = this._register(this.instantiationService.createInstance(QuickInputList, container, this.idPrefix + 'list'));
		this._register(list.onChangedAllVisibleChecked(checked => {
			checkAll.checked = checked;
		}));
		this._register(list.onChangedVisibleCount(c => {
			visibleCount.setCount(c);
		}));
		this._register(list.onChangedCheckedCount(c => {
			count.setCount(c);
		}));
		this._register(list.onLeave(() => {
			// Defer to avoid the input field reacting to the triggering key.
			setTimeout(() => {
				inputBox.setFocus();
				if (this.controller instanceof QuickPick && this.controller.canSelectMany) {
					list.clearFocus();
				}
			}, 0);
		}));
		this._register(list.onDidChangeFocus(() => {
			if (this.comboboxAccessibility) {
				this.ui.inputBox.setAttribute('aria-activedescendant', this.ui.list.getActiveDescendant() || '');
			}
		}));

		const focusTracker = dom.trackFocus(container);
		this._register(focusTracker);
		this._register(focusTracker.onDidBlur(() => {
			if (!this.ui.ignoreFocusOut && !this.environmentService.args['sticky-quickopen'] && this.configurationService.getValue(CLOSE_ON_FOCUS_LOST_CONFIG)) {
				this.hide(true);
			}
		}));
		this._register(dom.addDisposableListener(container, dom.EventType.FOCUS, (e: FocusEvent) => {
			inputBox.setFocus();
		}));
		this._register(dom.addDisposableListener(container, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Enter:
					dom.EventHelper.stop(e, true);
					this.onDidAcceptEmitter.fire();
					break;
				case KeyCode.Escape:
					dom.EventHelper.stop(e, true);
					this.hide();
					break;
				case KeyCode.Tab:
					if (!event.altKey && !event.ctrlKey && !event.metaKey) {
						const selectors = ['.action-label.icon'];
						if (container.classList.contains('show-checkboxes')) {
							selectors.push('input');
						} else {
							selectors.push('input[type=text]');
						}
						if (this.ui.list.isDisplayed()) {
							selectors.push('.monaco-list');
						}
						const stops = container.querySelectorAll<HTMLElement>(selectors.join(', '));
						if (event.shiftKey && event.target === stops[0]) {
							dom.EventHelper.stop(e, true);
							stops[stops.length - 1].focus();
						} else if (!event.shiftKey && event.target === stops[stops.length - 1]) {
							dom.EventHelper.stop(e, true);
							stops[0].focus();
						}
					}
					break;
			}
		}));

		this._register(this.quickOpenService.onShow(() => this.hide(true)));

		this.ui = {
			container,
			leftActionBar,
			title,
			rightActionBar,
			checkAll,
			inputBox,
			visibleCount,
			count,
			message,
			customButton,
			progressBar,
			list,
			onDidAccept: this.onDidAcceptEmitter.event,
			onDidCustom: this.onDidCustomEmitter.event,
			onDidTriggerButton: this.onDidTriggerButtonEmitter.event,
			ignoreFocusOut: false,
			keyMods: this.keyMods,
			isScreenReaderOptimized: () => this.isScreenReaderOptimized(),
			show: controller => this.show(controller),
			hide: () => this.hide(),
			setVisibilities: visibilities => this.setVisibilities(visibilities),
			setComboboxAccessibility: enabled => this.setComboboxAccessibility(enabled),
			setEnabled: enabled => this.setEnabled(enabled),
			setContextKey: contextKey => this.setContextKey(contextKey),
		};
		this.updateStyles();
	}

	pick<T extends IQuickPickItem, O extends IPickOptions<T>>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options: O = <O>{}, token: CancellationToken = CancellationToken.None): Promise<O extends { canPickMany: true } ? T[] : T> {
		return new Promise<O extends { canPickMany: true } ? T[] : T>((doResolve, reject) => {
			let resolve = (result: any) => {
				resolve = doResolve;
				if (options.onKeyMods) {
					options.onKeyMods(input.keyMods);
				}
				doResolve(result);
			};
			if (token.isCancellationRequested) {
				resolve(undefined);
				return;
			}
			const input = this.createQuickPick<T>();
			let activeItem: T | undefined;
			const disposables = [
				input,
				input.onDidAccept(() => {
					if (input.canSelectMany) {
						resolve(<any>input.selectedItems.slice());
						input.hide();
					} else {
						const result = input.activeItems[0];
						if (result) {
							resolve(<any>result);
							input.hide();
						}
					}
				}),
				input.onDidChangeActive(items => {
					const focused = items[0];
					if (focused && options.onDidFocus) {
						options.onDidFocus(focused);
					}
				}),
				input.onDidChangeSelection(items => {
					if (!input.canSelectMany) {
						const result = items[0];
						if (result) {
							resolve(<any>result);
							input.hide();
						}
					}
				}),
				input.onDidTriggerItemButton(event => options.onDidTriggerItemButton && options.onDidTriggerItemButton({
					...event,
					removeItem: () => {
						const index = input.items.indexOf(event.item);
						if (index !== -1) {
							const items = input.items.slice();
							items.splice(index, 1);
							input.items = items;
						}
					}
				})),
				input.onDidChangeValue(value => {
					if (activeItem && !value && (input.activeItems.length !== 1 || input.activeItems[0] !== activeItem)) {
						input.activeItems = [activeItem];
					}
				}),
				token.onCancellationRequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposables);
					resolve(undefined);
				}),
			];
			input.canSelectMany = !!options.canPickMany;
			input.placeholder = options.placeHolder;
			input.ignoreFocusOut = !!options.ignoreFocusLost;
			input.matchOnDescription = !!options.matchOnDescription;
			input.matchOnDetail = !!options.matchOnDetail;
			input.matchOnLabel = (options.matchOnLabel === undefined) || options.matchOnLabel; // default to true
			input.autoFocusOnList = (options.autoFocusOnList === undefined) || options.autoFocusOnList; // default to true
			input.quickNavigate = options.quickNavigate;
			input.contextKey = options.contextKey;
			input.busy = true;
			Promise.all<QuickPickInput<T>[], T | undefined>([picks, options.activeItem])
				.then(([items, _activeItem]) => {
					activeItem = _activeItem;
					input.busy = false;
					input.items = items;
					if (input.canSelectMany) {
						input.selectedItems = items.filter(item => item.type !== 'separator' && item.picked) as T[];
					}
					if (activeItem) {
						input.activeItems = [activeItem];
					}
				});
			input.show();
			Promise.resolve(picks).then(undefined, err => {
				reject(err);
				input.hide();
			});
		});
	}

	input(options: IInputOptions = {}, token: CancellationToken = CancellationToken.None): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			if (token.isCancellationRequested) {
				resolve(undefined);
				return;
			}
			const input = this.createInputBox();
			const validateInput = options.validateInput || (() => <Promise<undefined>>Promise.resolve(undefined));
			const onDidValueChange = Event.debounce(input.onDidChangeValue, (last, cur) => cur, 100);
			let validationValue = options.value || '';
			let validation = Promise.resolve(validateInput(validationValue));
			const disposables = [
				input,
				onDidValueChange(value => {
					if (value !== validationValue) {
						validation = Promise.resolve(validateInput(value));
						validationValue = value;
					}
					validation.then(result => {
						if (value === validationValue) {
							input.validationMessage = result || undefined;
						}
					});
				}),
				input.onDidAccept(() => {
					const value = input.value;
					if (value !== validationValue) {
						validation = Promise.resolve(validateInput(value));
						validationValue = value;
					}
					validation.then(result => {
						if (!result) {
							resolve(value);
							input.hide();
						} else if (value === validationValue) {
							input.validationMessage = result;
						}
					});
				}),
				token.onCancellationRequested(() => {
					input.hide();
				}),
				input.onDidHide(() => {
					dispose(disposables);
					resolve(undefined);
				}),
			];
			input.value = options.value || '';
			input.valueSelection = options.valueSelection;
			input.prompt = options.prompt;
			input.placeholder = options.placeHolder;
			input.password = !!options.password;
			input.ignoreFocusOut = !!options.ignoreFocusLost;
			input.show();
		});
	}

	backButton = backButton;

	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T> {
		this.create();
		return new QuickPick<T>(this.ui);
	}

	createInputBox(): IInputBox {
		this.create();
		return new InputBox(this.ui);
	}

	private show(controller: QuickInput) {
		this.create();
		this.quickOpenService.close();
		const oldController = this.controller;
		this.controller = controller;
		if (oldController) {
			oldController.didHide();
		}

		this.setEnabled(true);
		this.ui.leftActionBar.clear();
		this.ui.title.textContent = '';
		this.ui.rightActionBar.clear();
		this.ui.checkAll.checked = false;
		// this.ui.inputBox.value = ''; Avoid triggering an event.
		this.ui.inputBox.placeholder = '';
		this.ui.inputBox.password = false;
		this.ui.inputBox.showDecoration(Severity.Ignore);
		this.ui.visibleCount.setCount(0);
		this.ui.count.setCount(0);
		this.ui.message.textContent = '';
		this.ui.progressBar.stop();
		this.ui.list.setElements([]);
		this.ui.list.matchOnDescription = false;
		this.ui.list.matchOnDetail = false;
		this.ui.list.matchOnLabel = true;
		this.ui.ignoreFocusOut = false;
		this.setComboboxAccessibility(false);
		this.ui.inputBox.removeAttribute('aria-label');

		const keybinding = this.keybindingService.lookupKeybinding(BackAction.ID);
		backButton.tooltip = keybinding ? localize('quickInput.backWithKeybinding', "Back ({0})", keybinding.getLabel()) : localize('quickInput.back', "Back");

		this.inQuickOpen('quickInput', true);
		this.resetContextKeys();

		this.ui.container.style.display = '';
		this.updateLayout();
		this.ui.inputBox.setFocus();
	}

	private setVisibilities(visibilities: Visibilities) {
		this.ui.title.style.display = visibilities.title ? '' : 'none';
		this.ui.checkAll.style.display = visibilities.checkAll ? '' : 'none';
		this.filterContainer.style.display = visibilities.inputBox ? '' : 'none';
		this.visibleCountContainer.style.display = visibilities.visibleCount ? '' : 'none';
		this.countContainer.style.display = visibilities.count ? '' : 'none';
		this.okContainer.style.display = visibilities.ok ? '' : 'none';
		this.customButtonContainer.style.display = visibilities.customButton ? '' : 'none';
		this.ui.message.style.display = visibilities.message ? '' : 'none';
		this.ui.list.display(!!visibilities.list);
		this.ui.container.classList[visibilities.checkAll ? 'add' : 'remove']('show-checkboxes');
		this.updateLayout(); // TODO
	}

	private setComboboxAccessibility(enabled: boolean) {
		if (enabled !== this.comboboxAccessibility) {
			this.comboboxAccessibility = enabled;
			if (this.comboboxAccessibility) {
				this.ui.inputBox.setAttribute('role', 'combobox');
				this.ui.inputBox.setAttribute('aria-haspopup', 'true');
				this.ui.inputBox.setAttribute('aria-autocomplete', 'list');
				this.ui.inputBox.setAttribute('aria-activedescendant', this.ui.list.getActiveDescendant() || '');
			} else {
				this.ui.inputBox.removeAttribute('role');
				this.ui.inputBox.removeAttribute('aria-haspopup');
				this.ui.inputBox.removeAttribute('aria-autocomplete');
				this.ui.inputBox.removeAttribute('aria-activedescendant');
			}
		}
	}

	private isScreenReaderOptimized() {
		const detected = this.accessibilityService.getAccessibilitySupport() === AccessibilitySupport.Enabled;
		const config = this.configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
		return config === 'on' || (config === 'auto' && detected);
	}

	private setEnabled(enabled: boolean) {
		if (enabled !== this.enabled) {
			this.enabled = enabled;
			for (const item of this.ui.leftActionBar.viewItems) {
				(item as ActionViewItem).getAction().enabled = enabled;
			}
			for (const item of this.ui.rightActionBar.viewItems) {
				(item as ActionViewItem).getAction().enabled = enabled;
			}
			this.ui.checkAll.disabled = !enabled;
			// this.ui.inputBox.enabled = enabled; Avoid loosing focus.
			this.ok.enabled = enabled;
			this.ui.list.enabled = enabled;
		}
	}

	private hide(focusLost?: boolean) {
		const controller = this.controller;
		if (controller) {
			this.controller = null;
			this.inQuickOpen('quickInput', false);
			this.resetContextKeys();
			this.ui.container.style.display = 'none';
			if (!focusLost) {
				this.editorGroupService.activeGroup.focus();
			}
			controller.didHide();
		}
	}

	focus() {
		if (this.isDisplayed()) {
			this.ui.inputBox.setFocus();
		}
	}

	toggle() {
		if (this.isDisplayed() && this.controller instanceof QuickPick && this.controller.canSelectMany) {
			this.ui.list.toggleCheckbox();
		}
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration) {
		if (this.isDisplayed() && this.ui.list.isDisplayed()) {
			this.ui.list.focus(next ? 'Next' : 'Previous');
			if (quickNavigate && this.controller instanceof QuickPick) {
				this.controller.quickNavigate = quickNavigate;
			}
		}
	}

	accept() {
		this.onDidAcceptEmitter.fire();
		return Promise.resolve(undefined);
	}

	back() {
		this.onDidTriggerButtonEmitter.fire(this.backButton);
		return Promise.resolve(undefined);
	}

	cancel() {
		this.hide();
		return Promise.resolve(undefined);
	}

	layout(dimension: dom.Dimension): void {
		this.updateLayout();
	}

	private updateLayout() {
		if (this.ui) {
			const titlebarOffset = this.layoutService.getTitleBarOffset();
			this.ui.container.style.top = `${titlebarOffset}px`;

			const style = this.ui.container.style;
			const width = Math.min(this.layoutService.dimension.width * 0.62 /* golden cut */, QuickInputService.MAX_WIDTH);
			style.width = width + 'px';
			style.marginLeft = '-' + (width / 2) + 'px';

			this.ui.inputBox.layout();
			this.ui.list.layout();
		}
	}

	protected updateStyles() {
		const theme = this.themeService.getTheme();
		if (this.ui) {
			// TODO
			const titleColor = { dark: 'rgba(255, 255, 255, 0.105)', light: 'rgba(0,0,0,.06)', hc: 'black' }[theme.type];
			this.titleBar.style.backgroundColor = titleColor ? titleColor.toString() : null;
			this.ui.inputBox.style(theme);
			const quickInputBackground = theme.getColor(QUICK_INPUT_BACKGROUND);
			this.ui.container.style.backgroundColor = quickInputBackground ? quickInputBackground.toString() : null;
			const quickInputForeground = theme.getColor(QUICK_INPUT_FOREGROUND);
			this.ui.container.style.color = quickInputForeground ? quickInputForeground.toString() : null;
			const contrastBorderColor = theme.getColor(contrastBorder);
			this.ui.container.style.border = contrastBorderColor ? `1px solid ${contrastBorderColor}` : null;
			const widgetShadowColor = theme.getColor(widgetShadow);
			this.ui.container.style.boxShadow = widgetShadowColor ? `0 5px 8px ${widgetShadowColor}` : null;
		}
	}

	private isDisplayed() {
		return this.ui && this.ui.container.style.display !== 'none';
	}
}

export const QuickPickManyToggle: ICommandAndKeybindingRule = {
	id: 'workbench.action.quickPickManyToggle',
	weight: KeybindingWeight.WorkbenchContrib,
	when: inQuickOpenContext,
	primary: 0,
	handler: accessor => {
		const quickInputService = accessor.get(IQuickInputService);
		quickInputService.toggle();
	}
};

export class BackAction extends Action {

	public static readonly ID = 'workbench.action.quickInputBack';
	public static readonly LABEL = localize('back', "Back");

	constructor(id: string, label: string, @IQuickInputService private readonly quickInputService: IQuickInputService) {
		super(id, label);
	}

	public run(): Promise<any> {
		this.quickInputService.back();
		return Promise.resolve();
	}
}

registerSingleton(IQuickInputService, QuickInputService, true);
