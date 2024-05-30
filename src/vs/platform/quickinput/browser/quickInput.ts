/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { Button, IButtonStyles } from 'vs/base/browser/ui/button/button';
import { CountBadge, ICountBadgeStyles } from 'vs/base/browser/ui/countBadge/countBadge';
import { IHoverDelegate, IHoverDelegateOptions } from 'vs/base/browser/ui/hover/hoverDelegate';
import { IInputBoxStyles } from 'vs/base/browser/ui/inputbox/inputBox';
import { IKeybindingLabelStyles } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { IProgressBarStyles, ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { IToggleStyles, Toggle } from 'vs/base/browser/ui/toggle/toggle';
import { equals } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event, EventBufferer } from 'vs/base/common/event';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isIOS } from 'vs/base/common/platform';
import Severity from 'vs/base/common/severity';
import { ThemeIcon } from 'vs/base/common/themables';
import 'vs/css!./media/quickInput';
import { localize } from 'vs/nls';
import { IInputBox, IKeyMods, IQuickInput, IQuickInputButton, IQuickInputHideEvent, IQuickInputToggle, IQuickNavigateConfiguration, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickPickSeparatorButtonEvent, IQuickPickWillAcceptEvent, IQuickWidget, ItemActivation, NO_KEY_MODS, QuickInputHideReason, QuickInputType } from 'vs/platform/quickinput/common/quickInput';
import { QuickInputBox } from './quickInputBox';
import { quickInputButtonToAction, renderQuickInputDescription } from './quickInputUtils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IHoverService, WorkbenchHoverDelegate } from 'vs/platform/hover/browser/hover';
import { QuickInputTree } from 'vs/platform/quickinput/browser/quickInputTree';
import { QuickPickFocus } from '../common/quickInput';
import type { IHoverOptions } from 'vs/base/browser/ui/hover/hover';
import { ContextKeyExpr, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const inQuickInputContextKeyValue = 'inQuickInput';
export const InQuickInputContextKey = new RawContextKey<boolean>(inQuickInputContextKeyValue, false, localize('inQuickInput', "Whether keyboard focus is inside the quick input control"));
export const inQuickInputContext = ContextKeyExpr.has(inQuickInputContextKeyValue);

export const quickInputTypeContextKeyValue = 'quickInputType';
export const QuickInputTypeContextKey = new RawContextKey<QuickInputType>(quickInputTypeContextKeyValue, undefined, localize('quickInputType', "The type of the currently visible quick input"));

export const endOfQuickInputBoxContextKeyValue = 'cursorAtEndOfQuickInputBox';
export const EndOfQuickInputBoxContextKey = new RawContextKey<boolean>(endOfQuickInputBoxContextKeyValue, false, localize('cursorAtEndOfQuickInputBox', "Whether the cursor in the quick input is at the end of the input box"));
export const endOfQuickInputBoxContext = ContextKeyExpr.has(endOfQuickInputBoxContextKeyValue);

export interface IQuickInputOptions {
	idPrefix: string;
	container: HTMLElement;
	ignoreFocusOut(): boolean;
	backKeybindingLabel(): string | undefined;
	setContextKey(id?: string): void;
	linkOpenerDelegate(content: string): void;
	returnFocus(): void;
	/**
	 * @todo With IHover in vs/editor, can we depend on the service directly
	 * instead of passing it through a hover delegate?
	 */
	hoverDelegate: IHoverDelegate;
	styles: IQuickInputStyles;
}

export interface IQuickInputStyles {
	readonly widget: IQuickInputWidgetStyles;
	readonly inputBox: IInputBoxStyles;
	readonly toggle: IToggleStyles;
	readonly countBadge: ICountBadgeStyles;
	readonly button: IButtonStyles;
	readonly progressBar: IProgressBarStyles;
	readonly keybindingLabel: IKeybindingLabelStyles;
	readonly list: IListStyles;
	readonly pickerGroup: { pickerGroupBorder: string | undefined; pickerGroupForeground: string | undefined };
}

export interface IQuickInputWidgetStyles {
	readonly quickInputBackground: string | undefined;
	readonly quickInputForeground: string | undefined;
	readonly quickInputTitleBackground: string | undefined;
	readonly widgetBorder: string | undefined;
	readonly widgetShadow: string | undefined;
}

export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

export const backButton = {
	iconClass: ThemeIcon.asClassName(Codicon.quickInputBack),
	tooltip: localize('quickInput.back', "Back"),
	handle: -1 // TODO
};

export interface QuickInputUI {
	container: HTMLElement;
	styleSheet: HTMLStyleElement;
	leftActionBar: ActionBar;
	titleBar: HTMLElement;
	title: HTMLElement;
	description1: HTMLElement;
	description2: HTMLElement;
	widget: HTMLElement;
	rightActionBar: ActionBar;
	checkAll: HTMLInputElement;
	inputContainer: HTMLElement;
	filterContainer: HTMLElement;
	inputBox: QuickInputBox;
	visibleCountContainer: HTMLElement;
	visibleCount: CountBadge;
	countContainer: HTMLElement;
	count: CountBadge;
	okContainer: HTMLElement;
	ok: Button;
	message: HTMLElement;
	customButtonContainer: HTMLElement;
	customButton: Button;
	progressBar: ProgressBar;
	list: QuickInputTree;
	onDidAccept: Event<void>;
	onDidCustom: Event<void>;
	onDidTriggerButton: Event<IQuickInputButton>;
	ignoreFocusOut: boolean;
	keyMods: Writeable<IKeyMods>;
	show(controller: QuickInput): void;
	setVisibilities(visibilities: Visibilities): void;
	setEnabled(enabled: boolean): void;
	setContextKey(contextKey?: string): void;
	linkOpenerDelegate(content: string): void;
	hide(): void;
}

export type Visibilities = {
	title?: boolean;
	description?: boolean;
	checkAll?: boolean;
	inputBox?: boolean;
	checkBox?: boolean;
	visibleCount?: boolean;
	count?: boolean;
	message?: boolean;
	list?: boolean;
	ok?: boolean;
	customButton?: boolean;
	progressBar?: boolean;
};

abstract class QuickInput extends Disposable implements IQuickInput {
	protected static readonly noPromptMessage = localize('inputModeEntry', "Press 'Enter' to confirm your input or 'Escape' to cancel");

	private _title: string | undefined;
	private _description: string | undefined;
	private _widget: HTMLElement | undefined;
	private _widgetUpdated = false;
	private _steps: number | undefined;
	private _totalSteps: number | undefined;
	protected visible = false;
	private _enabled = true;
	private _contextKey: string | undefined;
	private _busy = false;
	private _ignoreFocusOut = false;
	private _buttons: IQuickInputButton[] = [];
	private buttonsUpdated = false;
	private _toggles: IQuickInputToggle[] = [];
	private togglesUpdated = false;
	protected noValidationMessage = QuickInput.noPromptMessage;
	private _validationMessage: string | undefined;
	private _lastValidationMessage: string | undefined;
	private _severity: Severity = Severity.Ignore;
	private _lastSeverity: Severity | undefined;
	private readonly onDidTriggerButtonEmitter = this._register(new Emitter<IQuickInputButton>());
	private readonly onDidHideEmitter = this._register(new Emitter<IQuickInputHideEvent>());
	private readonly onWillHideEmitter = this._register(new Emitter<IQuickInputHideEvent>());
	private readonly onDisposeEmitter = this._register(new Emitter<void>());

	protected readonly visibleDisposables = this._register(new DisposableStore());

	private busyDelay: TimeoutTimer | undefined;

	abstract type: QuickInputType;

	constructor(
		protected ui: QuickInputUI
	) {
		super();
	}

	get title() {
		return this._title;
	}

	set title(title: string | undefined) {
		this._title = title;
		this.update();
	}

	get description() {
		return this._description;
	}

	set description(description: string | undefined) {
		this._description = description;
		this.update();
	}

	get widget() {
		return this._widget;
	}

	set widget(widget: unknown | undefined) {
		if (!(dom.isHTMLElement(widget))) {
			return;
		}
		if (this._widget !== widget) {
			this._widget = widget;
			this._widgetUpdated = true;
			this.update();
		}
	}

	get step() {
		return this._steps;
	}

	set step(step: number | undefined) {
		this._steps = step;
		this.update();
	}

	get totalSteps() {
		return this._totalSteps;
	}

	set totalSteps(totalSteps: number | undefined) {
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

	set contextKey(contextKey: string | undefined) {
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
		const shouldUpdate = this._ignoreFocusOut !== ignoreFocusOut && !isIOS;
		this._ignoreFocusOut = ignoreFocusOut && !isIOS;
		if (shouldUpdate) {
			this.update();
		}
	}

	get buttons() {
		return this._buttons;
	}

	set buttons(buttons: IQuickInputButton[]) {
		this._buttons = buttons;
		this.buttonsUpdated = true;
		this.update();
	}

	get toggles() {
		return this._toggles;
	}

	set toggles(toggles: IQuickInputToggle[]) {
		this._toggles = toggles ?? [];
		this.togglesUpdated = true;
		this.update();
	}

	get validationMessage() {
		return this._validationMessage;
	}

	set validationMessage(validationMessage: string | undefined) {
		this._validationMessage = validationMessage;
		this.update();
	}

	get severity() {
		return this._severity;
	}

	set severity(severity: Severity) {
		this._severity = severity;
		this.update();
	}

	readonly onDidTriggerButton = this.onDidTriggerButtonEmitter.event;

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

		// update properties in the controller that get reset in the ui.show() call
		this.visible = true;
		// This ensures the message/prompt gets rendered
		this._lastValidationMessage = undefined;
		// This ensures the input box has the right severity applied
		this._lastSeverity = undefined;
		if (this.buttons.length) {
			// if there are buttons, the ui.show() clears them out of the UI so we should
			// rerender them.
			this.buttonsUpdated = true;
		}
		if (this.toggles.length) {
			// if there are toggles, the ui.show() clears them out of the UI so we should
			// rerender them.
			this.togglesUpdated = true;
		}

		this.update();
	}

	hide(): void {
		if (!this.visible) {
			return;
		}
		this.ui.hide();
	}

	didHide(reason = QuickInputHideReason.Other): void {
		this.visible = false;
		this.visibleDisposables.clear();
		this.onDidHideEmitter.fire({ reason });
	}

	readonly onDidHide = this.onDidHideEmitter.event;

	willHide(reason = QuickInputHideReason.Other): void {
		this.onWillHideEmitter.fire({ reason });
	}
	readonly onWillHide = this.onWillHideEmitter.event;

	protected update() {
		if (!this.visible) {
			return;
		}
		const title = this.getTitle();
		if (title && this.ui.title.textContent !== title) {
			this.ui.title.textContent = title;
		} else if (!title && this.ui.title.innerHTML !== '&nbsp;') {
			this.ui.title.innerText = '\u00a0';
		}
		const description = this.getDescription();
		if (this.ui.description1.textContent !== description) {
			this.ui.description1.textContent = description;
		}
		if (this.ui.description2.textContent !== description) {
			this.ui.description2.textContent = description;
		}
		if (this._widgetUpdated) {
			this._widgetUpdated = false;
			if (this._widget) {
				dom.reset(this.ui.widget, this._widget);
			} else {
				dom.reset(this.ui.widget);
			}
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
			this.busyDelay = undefined;
		}
		if (this.buttonsUpdated) {
			this.buttonsUpdated = false;
			this.ui.leftActionBar.clear();
			const leftButtons = this.buttons
				.filter(button => button === backButton)
				.map((button, index) => quickInputButtonToAction(
					button,
					`id-${index}`,
					async () => this.onDidTriggerButtonEmitter.fire(button)
				));
			this.ui.leftActionBar.push(leftButtons, { icon: true, label: false });
			this.ui.rightActionBar.clear();
			const rightButtons = this.buttons
				.filter(button => button !== backButton)
				.map((button, index) => quickInputButtonToAction(
					button,
					`id-${index}`,
					async () => this.onDidTriggerButtonEmitter.fire(button)
				));
			this.ui.rightActionBar.push(rightButtons, { icon: true, label: false });
		}
		if (this.togglesUpdated) {
			this.togglesUpdated = false;
			// HACK: Filter out toggles here that are not concrete Toggle objects. This is to workaround
			// a layering issue as quick input's interface is in common but Toggle is in browser and
			// it requires a HTMLElement on its interface
			const concreteToggles = this.toggles?.filter(opts => opts instanceof Toggle) as Toggle[] ?? [];
			this.ui.inputBox.toggles = concreteToggles;
		}
		this.ui.ignoreFocusOut = this.ignoreFocusOut;
		this.ui.setEnabled(this.enabled);
		this.ui.setContextKey(this.contextKey);

		const validationMessage = this.validationMessage || this.noValidationMessage;
		if (this._lastValidationMessage !== validationMessage) {
			this._lastValidationMessage = validationMessage;
			dom.reset(this.ui.message);
			renderQuickInputDescription(validationMessage, this.ui.message, {
				callback: (content) => {
					this.ui.linkOpenerDelegate(content);
				},
				disposables: this.visibleDisposables,
			});
		}
		if (this._lastSeverity !== this.severity) {
			this._lastSeverity = this.severity;
			this.showMessageDecoration(this.severity);
		}
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

	private getDescription() {
		return this.description || '';
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
		if (severity !== Severity.Ignore) {
			const styles = this.ui.inputBox.stylesForType(severity);
			this.ui.message.style.color = styles.foreground ? `${styles.foreground}` : '';
			this.ui.message.style.backgroundColor = styles.background ? `${styles.background}` : '';
			this.ui.message.style.border = styles.border ? `1px solid ${styles.border}` : '';
			this.ui.message.style.marginBottom = '-2px';
		} else {
			this.ui.message.style.color = '';
			this.ui.message.style.backgroundColor = '';
			this.ui.message.style.border = '';
			this.ui.message.style.marginBottom = '';
		}
	}

	readonly onDispose = this.onDisposeEmitter.event;

	override dispose(): void {
		this.hide();
		this.onDisposeEmitter.fire();

		super.dispose();
	}
}

export class QuickPick<T extends IQuickPickItem> extends QuickInput implements IQuickPick<T> {

	private static readonly DEFAULT_ARIA_LABEL = localize('quickInputBox.ariaLabel', "Type to narrow down results.");

	private _value = '';
	private _ariaLabel: string | undefined;
	private _placeholder: string | undefined;
	private readonly onDidChangeValueEmitter = this._register(new Emitter<string>());
	private readonly onWillAcceptEmitter = this._register(new Emitter<IQuickPickWillAcceptEvent>());
	private readonly onDidAcceptEmitter = this._register(new Emitter<IQuickPickDidAcceptEvent>());
	private readonly onDidCustomEmitter = this._register(new Emitter<void>());
	private _items: Array<T | IQuickPickSeparator> = [];
	private itemsUpdated = false;
	private _canSelectMany = false;
	private _canAcceptInBackground = false;
	private _matchOnDescription = false;
	private _matchOnDetail = false;
	private _matchOnLabel = true;
	private _matchOnLabelMode: 'fuzzy' | 'contiguous' = 'fuzzy';
	private _sortByLabel = true;
	private _keepScrollPosition = false;
	private _itemActivation = ItemActivation.FIRST;
	private _activeItems: T[] = [];
	private activeItemsUpdated = false;
	private activeItemsToConfirm: T[] | null = [];
	private readonly onDidChangeActiveEmitter = this._register(new Emitter<T[]>());
	private _selectedItems: T[] = [];
	private selectedItemsUpdated = false;
	private selectedItemsToConfirm: T[] | null = [];
	private readonly onDidChangeSelectionEmitter = this._register(new Emitter<T[]>());
	private readonly onDidTriggerItemButtonEmitter = this._register(new Emitter<IQuickPickItemButtonEvent<T>>());
	private readonly onDidTriggerSeparatorButtonEmitter = this._register(new Emitter<IQuickPickSeparatorButtonEvent>());
	private _valueSelection: Readonly<[number, number]> | undefined;
	private valueSelectionUpdated = true;
	private _ok: boolean | 'default' = 'default';
	private _customButton = false;
	private _customButtonLabel: string | undefined;
	private _customButtonHover: string | undefined;
	private _quickNavigate: IQuickNavigateConfiguration | undefined;
	private _hideInput: boolean | undefined;
	private _hideCountBadge: boolean | undefined;
	private _hideCheckAll: boolean | undefined;
	private _focusEventBufferer = new EventBufferer();

	readonly type = QuickInputType.QuickPick;

	get quickNavigate() {
		return this._quickNavigate;
	}

	set quickNavigate(quickNavigate: IQuickNavigateConfiguration | undefined) {
		this._quickNavigate = quickNavigate;
		this.update();
	}

	get value() {
		return this._value;
	}

	set value(value: string) {
		this.doSetValue(value);
	}

	private doSetValue(value: string, skipUpdate?: boolean): void {
		if (this._value !== value) {
			this._value = value;
			if (!skipUpdate) {
				this.update();
			}
			if (this.visible) {
				const didFilter = this.ui.list.filter(this.filterValue(this._value));
				if (didFilter) {
					this.trySelectFirst();
				}
			}
			this.onDidChangeValueEmitter.fire(this._value);
		}
	}

	filterValue = (value: string) => value;

	set ariaLabel(ariaLabel: string | undefined) {
		this._ariaLabel = ariaLabel;
		this.update();
	}

	get ariaLabel() {
		return this._ariaLabel;
	}

	get placeholder() {
		return this._placeholder;
	}

	set placeholder(placeholder: string | undefined) {
		this._placeholder = placeholder;
		this.update();
	}

	onDidChangeValue = this.onDidChangeValueEmitter.event;

	onWillAccept = this.onWillAcceptEmitter.event;
	onDidAccept = this.onDidAcceptEmitter.event;

	onDidCustom = this.onDidCustomEmitter.event;

	get items() {
		return this._items;
	}

	get scrollTop() {
		return this.ui.list.scrollTop;
	}

	private set scrollTop(scrollTop: number) {
		this.ui.list.scrollTop = scrollTop;
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

	get canAcceptInBackground() {
		return this._canAcceptInBackground;
	}

	set canAcceptInBackground(canAcceptInBackground: boolean) {
		this._canAcceptInBackground = canAcceptInBackground;
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

	get matchOnLabelMode() {
		return this._matchOnLabelMode;
	}

	set matchOnLabelMode(matchOnLabelMode: 'fuzzy' | 'contiguous') {
		this._matchOnLabelMode = matchOnLabelMode;
		this.update();
	}

	get sortByLabel() {
		return this._sortByLabel;
	}

	set sortByLabel(sortByLabel: boolean) {
		this._sortByLabel = sortByLabel;
		this.update();
	}

	get keepScrollPosition() {
		return this._keepScrollPosition;
	}

	set keepScrollPosition(keepScrollPosition: boolean) {
		this._keepScrollPosition = keepScrollPosition;
	}

	get itemActivation() {
		return this._itemActivation;
	}

	set itemActivation(itemActivation: ItemActivation) {
		this._itemActivation = itemActivation;
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
		if (this._quickNavigate) {
			// Disable keyMods when quick navigate is enabled
			// because in this model the interaction is purely
			// keyboard driven and Ctrl/Alt are typically
			// pressed and hold during this interaction.
			return NO_KEY_MODS;
		}
		return this.ui.keyMods;
	}

	get valueSelection() {
		const selection = this.ui.inputBox.getSelection();
		if (!selection) {
			return undefined;
		}
		return [selection.start, selection.end];
	}

	set valueSelection(valueSelection: Readonly<[number, number]> | undefined) {
		this._valueSelection = valueSelection;
		this.valueSelectionUpdated = true;
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

	set customLabel(label: string | undefined) {
		this._customButtonLabel = label;
		this.update();
	}

	get customHover() {
		return this._customButtonHover;
	}

	set customHover(hover: string | undefined) {
		this._customButtonHover = hover;
		this.update();
	}

	get ok() {
		return this._ok;
	}

	set ok(showOkButton: boolean | 'default') {
		this._ok = showOkButton;
		this.update();
	}

	inputHasFocus(): boolean {
		return this.visible ? this.ui.inputBox.hasFocus() : false;
	}

	focusOnInput() {
		this.ui.inputBox.setFocus();
	}

	get hideInput() {
		return !!this._hideInput;
	}

	set hideInput(hideInput: boolean) {
		this._hideInput = hideInput;
		this.update();
	}

	get hideCountBadge() {
		return !!this._hideCountBadge;
	}

	set hideCountBadge(hideCountBadge: boolean) {
		this._hideCountBadge = hideCountBadge;
		this.update();
	}

	get hideCheckAll() {
		return !!this._hideCheckAll;
	}

	set hideCheckAll(hideCheckAll: boolean) {
		this._hideCheckAll = hideCheckAll;
		this.update();
	}

	onDidChangeSelection = this.onDidChangeSelectionEmitter.event;

	onDidTriggerItemButton = this.onDidTriggerItemButtonEmitter.event;

	onDidTriggerSeparatorButton = this.onDidTriggerSeparatorButtonEmitter.event;

	private trySelectFirst() {
		if (!this.canSelectMany) {
			this.ui.list.focus(QuickPickFocus.First);
		}
	}

	override show() {
		if (!this.visible) {
			this.visibleDisposables.add(
				this.ui.inputBox.onDidChange(value => {
					this.doSetValue(value, true /* skip update since this originates from the UI */);
				}));
			this.visibleDisposables.add(this.ui.onDidAccept(() => {
				if (this.canSelectMany) {
					// if there are no checked elements, it means that an onDidChangeSelection never fired to overwrite
					// `_selectedItems`. In that case, we should emit one with an empty array to ensure that
					// `.selectedItems` is up to date.
					if (!this.ui.list.getCheckedElements().length) {
						this._selectedItems = [];
						this.onDidChangeSelectionEmitter.fire(this.selectedItems);
					}
				} else if (this.activeItems[0]) {
					// For single-select, we set `selectedItems` to the item that was accepted.
					this._selectedItems = [this.activeItems[0]];
					this.onDidChangeSelectionEmitter.fire(this.selectedItems);
				}
				this.handleAccept(false);
			}));
			this.visibleDisposables.add(this.ui.onDidCustom(() => {
				this.onDidCustomEmitter.fire();
			}));
			this.visibleDisposables.add(this._focusEventBufferer.wrapEvent(
				this.ui.list.onDidChangeFocus,
				// Only fire the last event
				(_, e) => e
			)(focusedItems => {
				if (this.activeItemsUpdated) {
					return; // Expect another event.
				}
				if (this.activeItemsToConfirm !== this._activeItems && equals(focusedItems, this._activeItems, (a, b) => a === b)) {
					return;
				}
				this._activeItems = focusedItems as T[];
				this.onDidChangeActiveEmitter.fire(focusedItems as T[]);
			}));
			this.visibleDisposables.add(this.ui.list.onDidChangeSelection(({ items: selectedItems, event }) => {
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
					this.handleAccept(dom.isMouseEvent(event) && event.button === 1 /* mouse middle click */);
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
			this.visibleDisposables.add(this.ui.list.onSeparatorButtonTriggered(event => this.onDidTriggerSeparatorButtonEmitter.fire(event)));
			this.visibleDisposables.add(this.registerQuickNavigation());
			this.valueSelectionUpdated = true;
		}
		super.show(); // TODO: Why have show() bubble up while update() trickles down?
	}

	private handleAccept(inBackground: boolean): void {

		// Figure out veto via `onWillAccept` event
		let veto = false;
		this.onWillAcceptEmitter.fire({ veto: () => veto = true });

		// Continue with `onDidAccept` if no veto
		if (!veto) {
			this.onDidAcceptEmitter.fire({ inBackground });
		}
	}

	private registerQuickNavigation() {
		return dom.addDisposableListener(this.ui.container, dom.EventType.KEY_UP, e => {
			if (this.canSelectMany || !this._quickNavigate) {
				return;
			}

			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
			const keyCode = keyboardEvent.keyCode;

			// Select element when keys are pressed that signal it
			const quickNavKeys = this._quickNavigate.keybindings;
			const wasTriggerKeyPressed = quickNavKeys.some(k => {
				const chords = k.getChords();
				if (chords.length > 1) {
					return false;
				}

				if (chords[0].shiftKey && keyCode === KeyCode.Shift) {
					if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
						return false; // this is an optimistic check for the shift key being used to navigate back in quick input
					}

					return true;
				}

				if (chords[0].altKey && keyCode === KeyCode.Alt) {
					return true;
				}

				if (chords[0].ctrlKey && keyCode === KeyCode.Ctrl) {
					return true;
				}

				if (chords[0].metaKey && keyCode === KeyCode.Meta) {
					return true;
				}

				return false;
			});

			if (wasTriggerKeyPressed) {
				if (this.activeItems[0]) {
					this._selectedItems = [this.activeItems[0]];
					this.onDidChangeSelectionEmitter.fire(this.selectedItems);
					this.handleAccept(false);
				}
				// Unset quick navigate after press. It is only valid once
				// and should not result in any behaviour change afterwards
				// if the picker remains open because there was no active item
				this._quickNavigate = undefined;
			}
		});
	}

	protected override update() {
		if (!this.visible) {
			return;
		}
		// store the scrollTop before it is reset
		const scrollTopBefore = this.keepScrollPosition ? this.scrollTop : 0;
		const hasDescription = !!this.description;
		const visibilities: Visibilities = {
			title: !!this.title || !!this.step || !!this.buttons.length,
			description: hasDescription,
			checkAll: this.canSelectMany && !this._hideCheckAll,
			checkBox: this.canSelectMany,
			inputBox: !this._hideInput,
			progressBar: !this._hideInput || hasDescription,
			visibleCount: true,
			count: this.canSelectMany && !this._hideCountBadge,
			ok: this.ok === 'default' ? this.canSelectMany : this.ok,
			list: true,
			message: !!this.validationMessage,
			customButton: this.customButton
		};
		this.ui.setVisibilities(visibilities);
		super.update();
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

		let ariaLabel = this.ariaLabel;
		// Only set aria label to the input box placeholder if we actually have an input box.
		if (!ariaLabel && visibilities.inputBox) {
			ariaLabel = this.placeholder || QuickPick.DEFAULT_ARIA_LABEL;
			// If we have a title, include it in the aria label.
			if (this.title) {
				ariaLabel += ` - ${this.title}`;
			}
		}
		if (this.ui.list.ariaLabel !== ariaLabel) {
			this.ui.list.ariaLabel = ariaLabel ?? null;
		}
		this.ui.list.matchOnDescription = this.matchOnDescription;
		this.ui.list.matchOnDetail = this.matchOnDetail;
		this.ui.list.matchOnLabel = this.matchOnLabel;
		this.ui.list.matchOnLabelMode = this.matchOnLabelMode;
		this.ui.list.sortByLabel = this.sortByLabel;
		if (this.itemsUpdated) {
			this.itemsUpdated = false;
			this._focusEventBufferer.bufferEvents(() => {
				this.ui.list.setElements(this.items);
				// We want focus to exist in the list if there are items so that space can be used to toggle
				this.ui.list.shouldLoop = !this.canSelectMany;
				this.ui.list.filter(this.filterValue(this.ui.inputBox.value));
				this.ui.checkAll.checked = this.ui.list.getAllVisibleChecked();
				this.ui.visibleCount.setCount(this.ui.list.getVisibleCount());
				this.ui.count.setCount(this.ui.list.getCheckedCount());
				switch (this._itemActivation) {
					case ItemActivation.NONE:
						this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
						break;
					case ItemActivation.SECOND:
						this.ui.list.focus(QuickPickFocus.Second);
						this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
						break;
					case ItemActivation.LAST:
						this.ui.list.focus(QuickPickFocus.Last);
						this._itemActivation = ItemActivation.FIRST; // only valid once, then unset
						break;
					default:
						this.trySelectFirst();
						break;
				}
			});
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
		this.ui.customButton.label = this.customLabel || '';
		this.ui.customButton.element.title = this.customHover || '';
		if (!visibilities.inputBox) {
			// we need to move focus into the tree to detect keybindings
			// properly when the input box is not visible (quick nav)
			this.ui.list.domFocus();

			// Focus the first element in the list if multiselect is enabled
			if (this.canSelectMany) {
				this.ui.list.focus(QuickPickFocus.First);
			}
		}

		// Set the scroll position to what it was before updating the items
		if (this.keepScrollPosition) {
			this.scrollTop = scrollTopBefore;
		}
	}

	focus(focus: QuickPickFocus): void {
		this.ui.list.focus(focus);
		// To allow things like space to check/uncheck items
		if (this.canSelectMany) {
			this.ui.list.domFocus();
		}
	}

	accept(inBackground?: boolean | undefined): void {
		if (inBackground && !this._canAcceptInBackground) {
			return; // needs to be enabled
		}

		if (this.activeItems[0]) {
			this._selectedItems = [this.activeItems[0]];
			this.onDidChangeSelectionEmitter.fire(this.selectedItems);
			this.handleAccept(inBackground ?? false);
		}
	}
}

export class InputBox extends QuickInput implements IInputBox {
	private _value = '';
	private _valueSelection: Readonly<[number, number]> | undefined;
	private valueSelectionUpdated = true;
	private _placeholder: string | undefined;
	private _password = false;
	private _prompt: string | undefined;
	private readonly onDidValueChangeEmitter = this._register(new Emitter<string>());
	private readonly onDidAcceptEmitter = this._register(new Emitter<void>());

	readonly type = QuickInputType.InputBox;

	get value() {
		return this._value;
	}

	set value(value: string) {
		this._value = value || '';
		this.update();
	}

	get valueSelection() {
		const selection = this.ui.inputBox.getSelection();
		if (!selection) {
			return undefined;
		}
		return [selection.start, selection.end];
	}

	set valueSelection(valueSelection: Readonly<[number, number]> | undefined) {
		this._valueSelection = valueSelection;
		this.valueSelectionUpdated = true;
		this.update();
	}

	get placeholder() {
		return this._placeholder;
	}

	set placeholder(placeholder: string | undefined) {
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

	set prompt(prompt: string | undefined) {
		this._prompt = prompt;
		this.noValidationMessage = prompt
			? localize('inputModeEntryDescription', "{0} (Press 'Enter' to confirm or 'Escape' to cancel)", prompt)
			: QuickInput.noPromptMessage;
		this.update();
	}

	readonly onDidChangeValue = this.onDidValueChangeEmitter.event;

	readonly onDidAccept = this.onDidAcceptEmitter.event;

	override show() {
		if (!this.visible) {
			this.visibleDisposables.add(
				this.ui.inputBox.onDidChange(value => {
					if (value === this.value) {
						return;
					}
					this._value = value;
					this.onDidValueChangeEmitter.fire(value);
				}));
			this.visibleDisposables.add(this.ui.onDidAccept(() => this.onDidAcceptEmitter.fire()));
			this.valueSelectionUpdated = true;
		}
		super.show();
	}

	protected override update() {
		if (!this.visible) {
			return;
		}

		this.ui.container.classList.remove('hidden-input');
		const visibilities: Visibilities = {
			title: !!this.title || !!this.step || !!this.buttons.length,
			description: !!this.description || !!this.step,
			inputBox: true,
			message: true,
			progressBar: true
		};

		this.ui.setVisibilities(visibilities);
		super.update();
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
	}
}

export class QuickWidget extends QuickInput implements IQuickWidget {
	readonly type = QuickInputType.QuickWidget;

	protected override update() {
		if (!this.visible) {
			return;
		}

		const visibilities: Visibilities = {
			title: !!this.title || !!this.step || !!this.buttons.length,
			description: !!this.description || !!this.step
		};

		this.ui.setVisibilities(visibilities);
		super.update();
	}
}

export class QuickInputHoverDelegate extends WorkbenchHoverDelegate {

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService
	) {
		super('element', false, (options) => this.getOverrideOptions(options), configurationService, hoverService);
	}

	private getOverrideOptions(options: IHoverDelegateOptions): Partial<IHoverOptions> {
		// Only show the hover hint if the content is of a decent size
		const showHoverHint = (
			dom.isHTMLElement(options.content)
				? options.content.textContent ?? ''
				: typeof options.content === 'string'
					? options.content
					: options.content.value
		).includes('\n');

		return {
			persistence: {
				hideOnKeyDown: false,
			},
			appearance: {
				showHoverHint,
				skipFadeInAnimation: true,
			},
		};
	}
}
