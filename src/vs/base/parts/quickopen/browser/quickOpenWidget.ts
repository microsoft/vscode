/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./quickopen';
import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import platform = require('vs/base/common/platform');
import browser = require('vs/base/browser/browser');
import {EventType} from 'vs/base/common/events';
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import uuid = require('vs/base/common/uuid');
import {IQuickNavigateConfiguration, IAutoFocus, IEntryRunContext, IModel, Mode} from 'vs/base/parts/quickopen/common/quickOpen';
import {Filter, Renderer, DataSource, IModelProvider, AccessibilityProvider} from 'vs/base/parts/quickopen/browser/quickOpenViewer';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {ISelectionEvent, IFocusEvent, ITree, ContextMenuEvent} from 'vs/base/parts/tree/browser/tree';
import {InputBox, MessageType} from 'vs/base/browser/ui/inputbox/inputBox';
import Severity from 'vs/base/common/severity';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {DefaultController, ClickBehavior} from 'vs/base/parts/tree/browser/treeDefaults';
import DOM = require('vs/base/browser/dom');
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {KeyCode, KeyMod, CommonKeybindings} from 'vs/base/common/keyCodes';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {ScrollbarVisibility} from 'vs/base/common/scrollable';

export interface IQuickOpenCallbacks {
	onOk: () => void;
	onCancel: () => void;
	onType: (value: string) => void;
	onShow?: () => void;
	onHide?: (focusLost?: boolean) => void;
	onFocusLost?: () => boolean /* veto close */;
}

export interface IQuickOpenOptions {
	minItemsToShow?: number;
	maxItemsToShow?: number;
	inputPlaceHolder: string;
	inputAriaLabel?: string;
	actionProvider?: IActionProvider;
	enableAnimations?: boolean;
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
	private currentInputToken: string;
	private quickNavigateConfiguration: IQuickNavigateConfiguration;
	private container: HTMLElement;
	private treeElement: HTMLElement;
	private inputElement: HTMLElement;
	private usageLogger: IQuickOpenUsageLogger;
	private layoutDimensions: Dimension;
	private model: IModel<any>;

	constructor(container: HTMLElement, callbacks: IQuickOpenCallbacks, options: IQuickOpenOptions, usageLogger?: IQuickOpenUsageLogger) {
		this.toUnbind = [];
		this.container = container;
		this.callbacks = callbacks;
		this.options = options;
		this.usageLogger = usageLogger;
		this.model = null;
	}

	getModel(): IModel<any> {
		return this.model;
	}

	public setCallbacks(callbacks: IQuickOpenCallbacks): void {
		this.callbacks = callbacks;
	}

	public create(): void {
		this.builder = $().div((div: Builder) => {

			// Eventing
			div.on(DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				let keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
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
					let keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);

					if (platform.isMacintosh) {
						if (keyboardEvent.equals(CommonKeybindings.WINCTRL_N)) {
							keyboardEvent.keyCode = KeyCode.DownArrow;
						}
						else if (keyboardEvent.equals(CommonKeybindings.WINCTRL_P)) {
							keyboardEvent.keyCode = KeyCode.UpArrow;
						}
					}

					// Do not handle Tab: It is used to navigate between elements without mouse
					if (keyboardEvent.keyCode === KeyCode.Tab) {
						return;
					}

					// Pass tree navigation keys to the tree but leave focus in input field
					else if (keyboardEvent.keyCode === KeyCode.Tab || keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
						DOM.EventHelper.stop(e, true);

						this.navigateInTree(keyboardEvent.keyCode, keyboardEvent.shiftKey);
					}

					// Select element on Enter
					else if (keyboardEvent.keyCode === KeyCode.Enter) {
						DOM.EventHelper.stop(e, true);

						let focus = this.tree.getFocus();
						if (focus) {
							this.elementSelected(focus, e);
						}
					}

					// Bug in IE 9: onInput is not fired for Backspace or Delete keys
					else if (browser.isIE9 && (keyboardEvent.keyCode === KeyCode.Backspace || keyboardEvent.keyCode === KeyCode.Delete)) {
						this.onType();
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
					let keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);

					// Only handle when in quick navigation mode
					if (!this.quickNavigateConfiguration) {
						return;
					}

					if (platform.isMacintosh) {
						if (keyboardEvent.equals(CommonKeybindings.WINCTRL_N)) {
							keyboardEvent.keyCode = KeyCode.DownArrow;
						}
						else if (keyboardEvent.equals(CommonKeybindings.WINCTRL_P)) {
							keyboardEvent.keyCode = KeyCode.UpArrow;
						}
					}

					// Support keyboard navigation in quick navigation mode
					if (keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
						DOM.EventHelper.stop(e, true);

						this.navigateInTree(keyboardEvent.keyCode);
					}
				}).
				on(DOM.EventType.KEY_UP, (e: KeyboardEvent) => {
					let keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
					let keyCode = keyboardEvent.keyCode;

					// Only handle when in quick navigation mode
					if (!this.quickNavigateConfiguration) {
						return;
					}

					// Select element when keys are pressed that signal it
					let quickNavKeys = this.quickNavigateConfiguration.keybindings;
					let wasTriggerKeyPressed = keyCode === KeyCode.Enter || quickNavKeys.some((k) => {
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
						let focus = this.tree.getFocus();
						if (focus) {
							this.elementSelected(focus, e);
						}
					}
				}).
				clone();
		})

			// Widget Attributes
			.addClass('quick-open-widget')
			.addClass((browser.isIE10orEarlier) ? ' no-shadow' : '')
			.build(this.container);

		// Support layout
		if (this.layoutDimensions) {
			this.layout(this.layoutDimensions);
		}
	}

	private onType(): void {
		let value = this.inputBox.value;

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

	public quickNavigate(configuration: IQuickNavigateConfiguration, next: boolean): void {
		if (this.isVisible) {

			// Transition into quick navigate mode if not yet done
			if (!this.quickNavigateConfiguration) {
				this.quickNavigateConfiguration = configuration;
				this.tree.DOMFocus();
			}

			// Navigate
			this.navigateInTree(next ? KeyCode.DownArrow : KeyCode.UpArrow);
		}
	}

	private navigateInTree(keyCode: KeyCode, isShift?: boolean): void {
		const model: IModel<any> = this.tree.getInput();
		const entries = model ? model.entries : [];
		let focus = this.tree.getFocus();
		let cycled = false;
		let revealToTop = false;

		// Support cycle-through navigation
		if (entries.length > 1) {

			// Up from no entry or first entry goes down to last
			if ((keyCode === KeyCode.UpArrow || (keyCode === KeyCode.Tab && isShift)) && (focus === entries[0] || !focus)) { // TODO@Ben should not make ordering assumptions
				this.tree.focusLast();
				cycled = true;
			}

			// Down from last entry goes to up to first
			else if ((keyCode === KeyCode.DownArrow || keyCode === KeyCode.Tab && !isShift) && focus === entries[entries.length - 1]) { // TODO@Ben should not make ordering assumptions
				this.tree.focusFirst();
				cycled = true;
			}
		}

		// Normal Navigation
		if (!cycled) {
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
		}

		// Reveal
		focus = this.tree.getFocus();
		if (focus) {
			revealToTop ? this.tree.reveal(focus, 0).done(null, errors.onUnexpectedError) : this.tree.reveal(focus).done(null, errors.onUnexpectedError);
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

	private elementSelected(value: any, event?: any): void {
		let hide = true;

		// Trigger open of element on selection
		if (this.isVisible()) {
			const context: IEntryRunContext = { event: event, keymods: this.extractKeyMods(event), quickNavigateConfiguration: this.quickNavigateConfiguration };
			hide = this.model.runner.run(value, Mode.OPEN, context);
		}

		// add telemetry when an item is accepted, logging the index of the item in the list and the length of the list
		// to measure the rate of the success and the relevance of the order
		if (this.usageLogger) {
			let indexOfAcceptedElement = this.model.entries.indexOf(value);
			let entriesCount = this.model.entries.length;
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
			if (this.options.enableAnimations) {
				this.treeContainer.removeClass('transition');
			}
			this.builder.show();
			this.tree.DOMFocus();
		}

		// Otherwise use normal UI
		else {
			this.inputContainer.show();
			if (this.options.enableAnimations) {
				this.treeContainer.addClass('transition');
			}
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

		// Use a generated token to avoid race conditions from setting input
		let currentInputToken = uuid.generateUuid();
		this.currentInputToken = currentInputToken;

		// setInput and Layout
		this.setTreeHeightForInput(input).then(() => {
			if (this.currentInputToken === currentInputToken) {
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
		});
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
			let prefix = autoFocus.autoFocusPrefixMatch;
			let lowerCasePrefix = prefix.toLowerCase();
			for (let i = 0; i < entries.length; i++) {
				let entry = entries[i];
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

			let entryToFocus = caseSensitiveMatch || caseInsensitiveMatch;
			if (entryToFocus) {
				this.tree.setFocus(entryToFocus);
				this.tree.reveal(entryToFocus, 0).done(null, errors.onUnexpectedError);

				return;
			}
		}

		// Second check for auto focus of first entry
		if (autoFocus.autoFocusFirstEntry) {
			this.tree.focusFirst();
			this.tree.reveal(this.tree.getFocus(), 0).done(null, errors.onUnexpectedError);
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
		this.setTreeHeightForInput(input).then(() => {
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
		});
	}

	private setTreeHeightForInput(input: IModel<any>): TPromise<void> {
		let newHeight = this.getHeight(input) + 'px';
		let oldHeight = this.treeContainer.style('height');

		// Apply
		this.treeContainer.style({ height: newHeight });

		// Return instantly if we don't CSS transition or the height is the same as old
		if (!this.treeContainer.hasClass('transition') || oldHeight === newHeight) {
			return TPromise.as(null);
		}

		// Otherwise return promise that only fulfills when the CSS transition has ended
		return new TPromise<void>((c, e) => {
			let unbind: IDisposable[] = [];
			let complete = false;
			let completeHandler = () => {
				if (!complete) {
					complete = true;

					unbind = dispose(unbind);

					c(null);
				}
			};

			this.treeContainer.once('webkitTransitionEnd', completeHandler, unbind);
			this.treeContainer.once('transitionend', completeHandler, unbind);
		});
	}

	private getHeight(input: IModel<any>): number {
		const renderer = input.renderer;

		if (!input) {
			let itemHeight = renderer.getHeight(null);

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

		let entries = input.entries.filter(e => this.isElementVisible(input, e));
		let maxEntries = this.options.maxItemsToShow || entries.length;
		for (let i = 0; i < maxEntries && i < entries.length; i++) {
			let entryHeight = renderer.getHeight(entries[i]);
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
				let entriesCount = this.model.entries.filter(e => this.isElementVisible(this.model, e)).length;
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
		if (reason === HideReason.CANCELED) {
			this.callbacks.onCancel();
		} else {
			this.callbacks.onOk();
		}

		if (this.callbacks.onHide) {
			this.callbacks.onHide(reason === HideReason.FOCUS_LOST);
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

	public setValue(value: string): void {
		if (this.inputBox) {
			this.inputBox.value = value;
			this.inputBox.select();
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

		// Adapt tree height to entries and apply input
		this.setInputAndLayout(input, autoFocus);

		// Apply ARIA
		if (this.inputBox) {
			this.inputBox.setAriaLabel(ariaLabel || DEFAULT_INPUT_ARIA_LABEL);
		}
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

	public runFocus(): boolean {
		let focus = this.tree.getFocus();
		if (focus) {
			this.elementSelected(focus);
			return true;
		}

		return false;
	}

	public getProgressBar(): ProgressBar {
		return this.progressBar;
	}

	public setExtraClass(clazz: string): void {
		let previousClass = this.builder.getProperty('extra-class');
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
		let quickOpenWidth = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickOpenWidget.MAX_WIDTH);
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