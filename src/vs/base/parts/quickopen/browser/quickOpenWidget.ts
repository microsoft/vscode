/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./quickopen';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import platform = require('vs/base/common/platform');
import { EventType } from 'vs/base/common/events';
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import { IQuickNavigateConfiguration, IAutoFocus, IEntryRunContext, IModel, Mode } from 'vs/base/parts/quickopen/common/quickOpen';
import { Filter, Renderer, DataSource, IModelProvider, AccessibilityProvider } from 'vs/base/parts/quickopen/browser/quickOpenViewer';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { ISelectionEvent, IFocusEvent, ITree, ContextMenuEvent } from 'vs/base/parts/tree/browser/tree';
import { InputBox, MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import Severity from 'vs/base/common/severity';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { DefaultController, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import DOM = require('vs/base/browser/dom');
import { IActionProvider } from 'vs/base/parts/tree/browser/actionsRenderer';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

export interface IQuickOpenCallbacks {
	onOk: () => void;
	onCancel: () => void;
	onType: (value: string) => void;
	onShow?: () => void;
	onHide?: (reason: HideReason) => void;
	onFocusLost?: () => boolean /* veto close */;
}

export interface IQuickOpenOptions {
	minItemsToShow?: number;
	maxItemsToShow?: number;
	inputPlaceHolder: string;
	inputAriaLabel?: string;
	actionProvider?: IActionProvider;
}

export interface IShowOptions {
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
	autoFocus?: IAutoFocus;
}

export interface IQuickOpenUsageLogger {
	publicLog(eventName: string, data?: any): void;
}

export class QuickOpenController extends DefaultController {

	public onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean {
		if (platform.isMacintosh) {
			return this.onLeftClick(tree, element, event); // https://github.com/Microsoft/vscode/issues/1011
		}

		return super.onContextMenu(tree, element, event);
	}
}

export enum HideReason {
	ELEMENT_SELECTED,
	FOCUS_LOST,
	CANCELED
}

const DEFAULT_INPUT_ARIA_LABEL = nls.localize('quickOpenAriaLabel', "Quick picker. Type to narrow down results.");

export class QuickOpenWidget implements IModelProvider {

	private static MAX_WIDTH = 600;				// Max total width of quick open widget
	private static MAX_ITEMS_HEIGHT = 20 * 22;	// Max height of item list below input field

	private options: IQuickOpenOptions;
	private builder: Builder;
	private tree: ITree;
	private inputBox: InputBox;
	private inputContainer: Builder;
	private helpText: Builder;
	private treeContainer: Builder;
	private progressBar: ProgressBar;
	private visible: boolean;
	private isLoosingFocus: boolean;
	private callbacks: IQuickOpenCallbacks;
	private toUnbind: IDisposable[];
	private quickNavigateConfiguration: IQuickNavigateConfiguration;
	private container: HTMLElement;
	private treeElement: HTMLElement;
	private inputElement: HTMLElement;
	private usageLogger: IQuickOpenUsageLogger;
	private layoutDimensions: Dimension;
	private model: IModel<any>;
	private inputChangingTimeoutHandle: number;

	constructor(container: HTMLElement, callbacks: IQuickOpenCallbacks, options: IQuickOpenOptions, usageLogger?: IQuickOpenUsageLogger) {
		this.toUnbind = [];
		this.container = container;
		this.callbacks = callbacks;
		this.options = options;
		this.usageLogger = usageLogger;
		this.model = null;
	}

	public getElement(): Builder {
		return $(this.builder);
	}

	public getModel(): IModel<any> {
		return this.model;
	}

	public setCallbacks(callbacks: IQuickOpenCallbacks): void {
		this.callbacks = callbacks;
	}

	public create(): HTMLElement {
		this.builder = $().div((div: Builder) => {

			// Eventing
			div.on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
				if (keyboardEvent.keyCode === KeyCode.Escape) {
					DOM.EventHelper.stop(e, true);

					this.hide(HideReason.CANCELED);
				}
			})
				.on(DOM.EventType.CONTEXT_MENU, (e: Event) => DOM.EventHelper.stop(e, true)) // Do this to fix an issue on Mac where the menu goes into the way
				.on(DOM.EventType.FOCUS, (e: Event) => this.gainingFocus(), null, true)
				.on(DOM.EventType.BLUR, (e: Event) => this.loosingFocus(e), null, true);

			// Progress Bar
			this.progressBar = new ProgressBar(div.clone());
			this.progressBar.getContainer().hide();

			// Input Field
			div.div({ 'class': 'quick-open-input' }, (inputContainer) => {
				this.inputContainer = inputContainer;
				this.inputBox = new InputBox(inputContainer.getHTMLElement(), null, {
					placeholder: this.options.inputPlaceHolder || '',
					ariaLabel: DEFAULT_INPUT_ARIA_LABEL
				});

				// ARIA
				this.inputElement = this.inputBox.inputElement;
				this.inputElement.setAttribute('role', 'combobox');
				this.inputElement.setAttribute('aria-haspopup', 'false');
				this.inputElement.setAttribute('aria-autocomplete', 'list');

				DOM.addDisposableListener(this.inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
					const shouldOpenInBackground = this.shouldOpenInBackground(keyboardEvent);

					// Do not handle Tab: It is used to navigate between elements without mouse
					if (keyboardEvent.keyCode === KeyCode.Tab) {
						return;
					}

					// Pass tree navigation keys to the tree but leave focus in input field
					else if (keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
						DOM.EventHelper.stop(e, true);

						this.navigateInTree(keyboardEvent.keyCode, keyboardEvent.shiftKey);

						// Position cursor at the end of input to allow right arrow (open in background) to function immediately
						this.inputBox.inputElement.selectionStart = this.inputBox.value.length;
					}

					// Select element on Enter or on Arrow-Right if we are at the end of the input
					else if (keyboardEvent.keyCode === KeyCode.Enter || shouldOpenInBackground) {
						DOM.EventHelper.stop(e, true);

						const focus = this.tree.getFocus();
						if (focus) {
							this.elementSelected(focus, e, shouldOpenInBackground ? Mode.OPEN_IN_BACKGROUND : Mode.OPEN);
						}
					}
				});

				DOM.addDisposableListener(this.inputBox.inputElement, DOM.EventType.INPUT, (e: Event) => {
					this.onType();
				});
			});

			// Tree
			this.treeContainer = div.div({
				'class': 'quick-open-tree'
			}, (div: Builder) => {
				this.tree = new Tree(div.getHTMLElement(), {
					dataSource: new DataSource(this),
					controller: new QuickOpenController({ clickBehavior: ClickBehavior.ON_MOUSE_UP }),
					renderer: new Renderer(this),
					filter: new Filter(this),
					accessibilityProvider: new AccessibilityProvider(this)
				}, {
						twistiePixels: 11,
						indentPixels: 0,
						alwaysFocused: true,
						verticalScrollMode: ScrollbarVisibility.Visible,
						ariaLabel: nls.localize('treeAriaLabel', "Quick Picker")
					});

				this.treeElement = this.tree.getHTMLElement();

				// Handle Focus and Selection event
				this.toUnbind.push(this.tree.addListener2(EventType.FOCUS, (event: IFocusEvent) => {
					this.elementFocused(event.focus, event);
				}));

				this.toUnbind.push(this.tree.addListener2(EventType.SELECTION, (event: ISelectionEvent) => {
					if (event.selection && event.selection.length > 0) {
						this.elementSelected(event.selection[0], event);
					}
				}));
			}).
				on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);

					// Only handle when in quick navigation mode
					if (!this.quickNavigateConfiguration) {
						return;
					}

					// Support keyboard navigation in quick navigation mode
					if (keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
						DOM.EventHelper.stop(e, true);

						this.navigateInTree(keyboardEvent.keyCode);
					}
				}).
				on(DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
					const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
					const keyCode = keyboardEvent.keyCode;

					// Only handle when in quick navigation mode
					if (!this.quickNavigateConfiguration) {
						return;
					}

					// Select element when keys are pressed that signal it
					const quickNavKeys = this.quickNavigateConfiguration.keybindings;
					const wasTriggerKeyPressed = keyCode === KeyCode.Enter || quickNavKeys.some((k) => {
						if (k.hasShift() && keyCode === KeyCode.Shift) {
							if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) {
								return false; // this is an optimistic check for the shift key being used to navigate back in quick open
							}

							return true;
						}

						if (k.hasAlt() && keyCode === KeyCode.Alt) {
							return true;
						}

						// Mac is a bit special
						if (platform.isMacintosh) {
							if (k.hasCtrlCmd() && keyCode === KeyCode.Meta) {
								return true;
							}

							if (k.hasWinCtrl() && keyCode === KeyCode.Ctrl) {
								return true;
							}
						}

						// Windows/Linux are not :)
						else {
							if (k.hasCtrlCmd() && keyCode === KeyCode.Ctrl) {
								return true;
							}

							if (k.hasWinCtrl() && keyCode === KeyCode.Meta) {
								return true;
							}
						}

						return false;
					});

					if (wasTriggerKeyPressed) {
						const focus = this.tree.getFocus();
						if (focus) {
							this.elementSelected(focus, e);
						}
					}
				}).
				clone();
		})

			// Widget Attributes
			.addClass('quick-open-widget')
			.build(this.container);

		// Support layout
		if (this.layoutDimensions) {
			this.layout(this.layoutDimensions);
		}

		return this.builder.getHTMLElement();
	}

	private shouldOpenInBackground(e: StandardKeyboardEvent): boolean {
		if (e.keyCode !== KeyCode.RightArrow) {
			return false; // only for right arrow
		}

		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
			return false; // no modifiers allowed
		}

		return this.inputBox.inputElement.selectionStart === this.inputBox.value.length; // only when cursor is at the end of the input field value
	}

	private onType(): void {
		const value = this.inputBox.value;

		// Adjust help text as needed if present
		if (this.helpText) {
			if (value) {
				this.helpText.hide();
			} else {
				this.helpText.show();
			}
		}

		// Send to callbacks
		this.callbacks.onType(value);
	}

	public navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		if (this.isVisible) {

			// Transition into quick navigate mode if not yet done
			if (!this.quickNavigateConfiguration) {
				this.quickNavigateConfiguration = quickNavigate;
				this.tree.DOMFocus();
			}

			// Navigate
			this.navigateInTree(next ? KeyCode.DownArrow : KeyCode.UpArrow);
		}
	}

	private navigateInTree(keyCode: KeyCode, isShift?: boolean): void {
		const model: IModel<any> = this.tree.getInput();
		const entries = model ? model.entries : [];
		const oldFocus = this.tree.getFocus();

		// Normal Navigation
		switch (keyCode) {
			case KeyCode.DownArrow:
				this.tree.focusNext();
				break;

			case KeyCode.UpArrow:
				this.tree.focusPrevious();
				break;

			case KeyCode.PageDown:
				this.tree.focusNextPage();
				break;

			case KeyCode.PageUp:
				this.tree.focusPreviousPage();
				break;

			case KeyCode.Tab:
				if (isShift) {
					this.tree.focusPrevious();
				} else {
					this.tree.focusNext();
				}
				break;
		}

		let newFocus = this.tree.getFocus();

		// Support cycle-through navigation if focus did not change
		if (entries.length > 1 && oldFocus === newFocus) {

			// Up from no entry or first entry goes down to last
			if (keyCode === KeyCode.UpArrow || (keyCode === KeyCode.Tab && isShift)) {
				this.tree.focusLast();
			}

			// Down from last entry goes to up to first
			else if (keyCode === KeyCode.DownArrow || keyCode === KeyCode.Tab && !isShift) {
				this.tree.focusFirst();
			}
		}

		// Reveal
		newFocus = this.tree.getFocus();
		if (newFocus) {
			this.tree.reveal(newFocus).done(null, errors.onUnexpectedError);
		}
	}

	private elementFocused(value: any, event?: any): void {
		if (!value || !this.isVisible()) {
			return;
		}

		// ARIA
		this.inputElement.setAttribute('aria-activedescendant', this.treeElement.getAttribute('aria-activedescendant'));

		const context: IEntryRunContext = { event: event, keymods: this.extractKeyMods(event), quickNavigateConfiguration: this.quickNavigateConfiguration };
		this.model.runner.run(value, Mode.PREVIEW, context);
	}

	private elementSelected(value: any, event?: any, preferredMode?: Mode): void {
		let hide = true;

		// Trigger open of element on selection
		if (this.isVisible()) {
			let mode = preferredMode || Mode.OPEN;

			const context: IEntryRunContext = { event, keymods: this.extractKeyMods(event), quickNavigateConfiguration: this.quickNavigateConfiguration };

			hide = this.model.runner.run(value, mode, context);
		}

		// add telemetry when an item is accepted, logging the index of the item in the list and the length of the list
		// to measure the rate of the success and the relevance of the order
		if (this.usageLogger) {
			const indexOfAcceptedElement = this.model.entries.indexOf(value);
			const entriesCount = this.model.entries.length;
			this.usageLogger.publicLog('quickOpenWidgetItemAccepted', { index: indexOfAcceptedElement, count: entriesCount, isQuickNavigate: this.quickNavigateConfiguration ? true : false });
		}

		// Hide if command was run successfully
		if (hide) {
			this.hide(HideReason.ELEMENT_SELECTED);
		}
	}

	private extractKeyMods(event: any): number[] {
		const isCtrlCmd = event && (event.ctrlKey || event.metaKey || (event.payload && event.payload.originalEvent && (event.payload.originalEvent.ctrlKey || event.payload.originalEvent.metaKey)));

		return isCtrlCmd ? [KeyMod.CtrlCmd] : [];
	}

	public show(prefix: string, options?: IShowOptions): void;
	public show(input: IModel<any>, options?: IShowOptions): void;
	public show(param: any, options?: IShowOptions): void {
		this.visible = true;
		this.isLoosingFocus = false;
		this.quickNavigateConfiguration = options ? options.quickNavigateConfiguration : void 0;

		// Adjust UI for quick navigate mode
		if (this.quickNavigateConfiguration) {
			this.inputContainer.hide();
			this.builder.show();
			this.tree.DOMFocus();
		}

		// Otherwise use normal UI
		else {
			this.inputContainer.show();
			this.builder.show();
			this.inputBox.focus();
		}

		// Adjust Help text for IE
		if (this.helpText) {
			if (this.quickNavigateConfiguration || types.isString(param)) {
				this.helpText.hide();
			} else {
				this.helpText.show();
			}
		}

		// Show based on param
		if (types.isString(param)) {
			this.doShowWithPrefix(param);
		} else {
			this.doShowWithInput(param, options && options.autoFocus ? options.autoFocus : {});
		}

		if (this.callbacks.onShow) {
			this.callbacks.onShow();
		}
	}

	private doShowWithPrefix(prefix: string): void {
		this.inputBox.value = prefix;
		this.callbacks.onType(prefix);
	}

	private doShowWithInput(input: IModel<any>, autoFocus: IAutoFocus): void {
		this.setInput(input, autoFocus);
	}

	private setInputAndLayout(input: IModel<any>, autoFocus: IAutoFocus): void {
		this.treeContainer.style({ height: `${this.getHeight(input)}px` });

		this.tree.setInput(null).then(() => {
			this.model = input;

			// ARIA
			this.inputElement.setAttribute('aria-haspopup', String(input && input.entries && input.entries.length > 0));

			return this.tree.setInput(input);
		}).done(() => {

			// Indicate entries to tree
			this.tree.layout();

			// Handle auto focus
			if (input && input.entries.some(e => this.isElementVisible(input, e))) {
				this.autoFocus(input, autoFocus);
			}
		}, errors.onUnexpectedError);
	}

	private isElementVisible<T>(input: IModel<T>, e: T): boolean {
		if (!input.filter) {
			return true;
		}

		return input.filter.isVisible(e);
	}

	private autoFocus(input: IModel<any>, autoFocus: IAutoFocus = {}): void {
		const entries = input.entries.filter(e => this.isElementVisible(input, e));

		// First check for auto focus of prefix matches
		if (autoFocus.autoFocusPrefixMatch) {
			let caseSensitiveMatch: any;
			let caseInsensitiveMatch: any;
			const prefix = autoFocus.autoFocusPrefixMatch;
			const lowerCasePrefix = prefix.toLowerCase();
			for (let i = 0; i < entries.length; i++) {
				const entry = entries[i];
				const label = input.dataSource.getLabel(entry);

				if (!caseSensitiveMatch && label.indexOf(prefix) === 0) {
					caseSensitiveMatch = entry;
				} else if (!caseInsensitiveMatch && label.toLowerCase().indexOf(lowerCasePrefix) === 0) {
					caseInsensitiveMatch = entry;
				}

				if (caseSensitiveMatch && caseInsensitiveMatch) {
					break;
				}
			}

			const entryToFocus = caseSensitiveMatch || caseInsensitiveMatch;
			if (entryToFocus) {
				this.tree.setFocus(entryToFocus);
				this.tree.reveal(entryToFocus, 0.5).done(null, errors.onUnexpectedError);

				return;
			}
		}

		// Second check for auto focus of first entry
		if (autoFocus.autoFocusFirstEntry) {
			this.tree.focusFirst();
			this.tree.reveal(this.tree.getFocus()).done(null, errors.onUnexpectedError);
		}

		// Third check for specific index option
		else if (typeof autoFocus.autoFocusIndex === 'number') {
			if (entries.length > autoFocus.autoFocusIndex) {
				this.tree.focusNth(autoFocus.autoFocusIndex);
				this.tree.reveal(this.tree.getFocus()).done(null, errors.onUnexpectedError);
			}
		}

		// Check for auto focus of second entry
		else if (autoFocus.autoFocusSecondEntry) {
			if (entries.length > 1) {
				this.tree.focusNth(1);
			}
		}

		// Finally check for auto focus of last entry
		else if (autoFocus.autoFocusLastEntry) {
			if (entries.length > 1) {
				this.tree.focusLast();
			}
		}
	}

	public refresh(input: IModel<any>, autoFocus: IAutoFocus): void {
		if (!this.isVisible()) {
			return;
		}

		// Apply height & Refresh
		this.treeContainer.style({ height: `${this.getHeight(input)}px` });
		this.tree.refresh().done(() => {

			// Indicate entries to tree
			this.tree.layout();

			let doAutoFocus = autoFocus && input && input.entries.some(e => this.isElementVisible(input, e));
			if (doAutoFocus && !autoFocus.autoFocusPrefixMatch) {
				doAutoFocus = !this.tree.getFocus(); // if auto focus is not for prefix matches, we do not want to change what the user has focussed already
			}

			// Handle auto focus
			if (doAutoFocus) {
				this.autoFocus(input, autoFocus);
			}
		}, errors.onUnexpectedError);
	}

	private getHeight(input: IModel<any>): number {
		const renderer = input.renderer;

		if (!input) {
			const itemHeight = renderer.getHeight(null);

			return this.options.minItemsToShow ? this.options.minItemsToShow * itemHeight : 0;
		}

		let height = 0;

		let preferredItemsHeight: number;
		if (this.layoutDimensions && this.layoutDimensions.height) {
			preferredItemsHeight = (this.layoutDimensions.height - 50 /* subtract height of input field (30px) and some spacing (drop shadow) to fit */) * 0.40 /* max 40% of screen */;
		}

		if (!preferredItemsHeight || preferredItemsHeight > QuickOpenWidget.MAX_ITEMS_HEIGHT) {
			preferredItemsHeight = QuickOpenWidget.MAX_ITEMS_HEIGHT;
		}

		const entries = input.entries.filter(e => this.isElementVisible(input, e));
		const maxEntries = this.options.maxItemsToShow || entries.length;
		for (let i = 0; i < maxEntries && i < entries.length; i++) {
			const entryHeight = renderer.getHeight(entries[i]);
			if (height + entryHeight <= preferredItemsHeight) {
				height += entryHeight;
			} else {
				break;
			}
		}

		return height;
	}

	public hide(reason?: HideReason): void {
		if (!this.isVisible()) {
			return;
		}

		this.visible = false;
		this.builder.hide();
		this.builder.domBlur();

		// report failure cases
		if (reason === HideReason.CANCELED) {
			if (this.model) {
				const entriesCount = this.model.entries.filter(e => this.isElementVisible(this.model, e)).length;
				if (this.usageLogger) {
					this.usageLogger.publicLog('quickOpenWidgetCancelled', { count: entriesCount, isQuickNavigate: this.quickNavigateConfiguration ? true : false });
				}
			}
		}

		// Clear input field and clear tree
		this.inputBox.value = '';
		this.tree.setInput(null);

		// ARIA
		this.inputElement.setAttribute('aria-haspopup', 'false');

		// Reset Tree Height
		this.treeContainer.style({ height: (this.options.minItemsToShow ? this.options.minItemsToShow * 22 : 0) + 'px' });

		// Clear any running Progress
		this.progressBar.stop().getContainer().hide();

		// Clear Focus
		if (this.tree.isDOMFocused()) {
			this.tree.DOMBlur();
		} else if (this.inputBox.hasFocus()) {
			this.inputBox.blur();
		}

		// Callbacks
		if (reason === HideReason.ELEMENT_SELECTED) {
			this.callbacks.onOk();
		} else {
			this.callbacks.onCancel();
		}

		if (this.callbacks.onHide) {
			this.callbacks.onHide(reason);
		}
	}

	public getQuickNavigateConfiguration(): IQuickNavigateConfiguration {
		return this.quickNavigateConfiguration;
	}

	public setPlaceHolder(placeHolder: string): void {
		if (this.inputBox) {
			this.inputBox.setPlaceHolder(placeHolder);
		}
	}

	public setValue(value: string, select: boolean): void {
		if (this.inputBox) {
			this.inputBox.value = value;
			if (select) {
				this.inputBox.select();
			}
		}
	}

	public setPassword(isPassword: boolean): void {
		if (this.inputBox) {
			this.inputBox.inputElement.type = isPassword ? 'password' : 'text';
		}
	}

	public setInput(input: IModel<any>, autoFocus: IAutoFocus, ariaLabel?: string): void {
		if (!this.isVisible()) {
			return;
		}

		// If the input changes, indicate this to the tree
		if (!!this.getInput()) {
			this.onInputChanging();
		}

		// Adapt tree height to entries and apply input
		this.setInputAndLayout(input, autoFocus);

		// Apply ARIA
		if (this.inputBox) {
			this.inputBox.setAriaLabel(ariaLabel || DEFAULT_INPUT_ARIA_LABEL);
		}
	}

	private onInputChanging(): void {
		if (this.inputChangingTimeoutHandle) {
			clearTimeout(this.inputChangingTimeoutHandle);
			this.inputChangingTimeoutHandle = null;
		}

		// when the input is changing in quick open, we indicate this as CSS class to the widget
		// for a certain timeout. this helps reducing some hectic UI updates when input changes quickly
		this.builder.addClass('content-changing');
		this.inputChangingTimeoutHandle = setTimeout(() => {
			this.builder.removeClass('content-changing');
		}, 500);
	}

	public getInput(): IModel<any> {
		return this.tree.getInput();
	}

	public showInputDecoration(decoration: Severity): void {
		if (this.inputBox) {
			this.inputBox.showMessage({ type: decoration === Severity.Info ? MessageType.INFO : decoration === Severity.Warning ? MessageType.WARNING : MessageType.ERROR, content: '' });
		}
	}

	public clearInputDecoration(): void {
		if (this.inputBox) {
			this.inputBox.hideMessage();
		}
	}

	public focus(): void {
		if (this.isVisible() && this.inputBox) {
			this.inputBox.focus();
		}
	}

	public accept(): void {
		if (this.isVisible()) {
			const focus = this.tree.getFocus();
			if (focus) {
				this.elementSelected(focus);
			}
		}
	}

	public getProgressBar(): ProgressBar {
		return this.progressBar;
	}

	public getInputBox(): InputBox {
		return this.inputBox;
	}

	public setExtraClass(clazz: string): void {
		const previousClass = this.builder.getProperty('extra-class');
		if (previousClass) {
			this.builder.removeClass(previousClass);
		}

		if (clazz) {
			this.builder.addClass(clazz);
			this.builder.setProperty('extra-class', clazz);
		} else if (previousClass) {
			this.builder.removeProperty('extra-class');
		}
	}

	public isVisible(): boolean {
		return this.visible;
	}

	public layout(dimension: Dimension): void {
		this.layoutDimensions = dimension;

		// Apply to quick open width (height is dynamic by number of items to show)
		const quickOpenWidth = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickOpenWidget.MAX_WIDTH);
		if (this.builder) {

			// quick open
			this.builder.style({
				width: quickOpenWidth + 'px',
				marginLeft: '-' + (quickOpenWidth / 2) + 'px'
			});

			// input field
			this.inputContainer.style({
				width: (quickOpenWidth - 12) + 'px'
			});
		}
	}

	private gainingFocus(): void {
		this.isLoosingFocus = false;
	}

	private loosingFocus(e: Event): void {
		if (!this.isVisible()) {
			return;
		}

		const relatedTarget = (<any>e).relatedTarget;
		if (!this.quickNavigateConfiguration && DOM.isAncestor(relatedTarget, this.builder.getHTMLElement())) {
			return; // user clicked somewhere into quick open widget, do not close thereby
		}

		this.isLoosingFocus = true;
		TPromise.timeout(0).then(() => {
			if (!this.isLoosingFocus) {
				return;
			}

			const veto = this.callbacks.onFocusLost && this.callbacks.onFocusLost();
			if (!veto) {
				this.hide(HideReason.FOCUS_LOST);
			}
		});
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		this.progressBar.dispose();
		this.inputBox.dispose();
		this.tree.dispose();
	}
}