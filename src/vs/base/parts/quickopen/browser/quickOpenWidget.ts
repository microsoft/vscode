/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./quickopen';
import {Promise} from 'vs/base/common/winjs.base';
import platform = require('vs/base/common/platform');
import browser = require('vs/base/browser/browser');
import {EventType} from 'vs/base/common/events';
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import uuid = require('vs/base/common/uuid');
import {IQuickNavigateConfiguration, IAutoFocus, IContext, IModel, Mode} from 'vs/base/parts/quickopen/browser/quickOpen';
import {Filter, Renderer, DataSource, IModelProvider} from 'vs/base/parts/quickopen/browser/quickOpenViewer';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import {ISelectionEvent, IFocusEvent, ITree} from 'vs/base/parts/tree/common/tree';
import {InputBox} from 'vs/base/browser/ui/inputbox/inputBox';
import {Tree} from 'vs/base/parts/tree/browser/treeImpl';
import {ProgressBar} from 'vs/base/browser/ui/progressbar/progressbar';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {DefaultController, ClickBehavior} from 'vs/base/parts/tree/browser/treeDefaults';
import DOM = require('vs/base/browser/dom');
import {IActionProvider} from 'vs/base/parts/tree/browser/actionsRenderer';
import {KeyCode} from 'vs/base/common/keyCodes';

export interface IQuickOpenCallbacks {
	onOk: () => void;
	onCancel: () => void;
	onType: (value: string) => void;
	onShow?: () => void;
	onHide?: () => void;
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

export interface IQuickOpenUsageLogger {
	publicLog(eventName: string, data?: any): void;
}

export class QuickOpenWidget implements IModelProvider {

	public static MAX_WIDTH = 600;				// Max total width of quick open widget
	public static MAX_ITEMS_HEIGHT = 20 * 24;	// Max height of item list below input field

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
	private toUnbind: { (): void; }[];
	private currentInputToken: string;
	private quickNavigateConfiguration: IQuickNavigateConfiguration;
	private container: HTMLElement;
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

					this.hide(true);
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
					ariaLabel: this.options.inputAriaLabel
				});
				DOM.addDisposableListener(this.inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
					let keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);

					// Pass tree navigation keys to the tree but leave focus in input field
					if (keyboardEvent.keyCode === KeyCode.Tab || keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
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
					controller: new DefaultController({ clickBehavior: ClickBehavior.ON_MOUSE_UP }),
					renderer: new Renderer(this),
					filter: new Filter(this)
				}, {
						twistiePixels: 11,
						indentPixels: 0,
						alwaysFocused: true,
						verticalScrollMode: 'visible'
					});

				// Handle Focus and Selection event
				this.toUnbind.push(this.tree.addListener(EventType.FOCUS, (event: IFocusEvent) => {
					this.elementFocused(event.focus, event);
				}));

				this.toUnbind.push(this.tree.addListener(EventType.SELECTION, (event: ISelectionEvent) => {
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
			revealToTop ? this.tree.reveal(focus, 0) : this.tree.reveal(focus);
		}
	}

	/*private cycleThroughEntryGroups(entries:QuickOpenEntry[], focus:QuickOpenEntry, isShift:boolean):void {

		// Return early if no entries present
		if (entries.length === 0) {
			return;
		}

		// Focus next/previous group if possible
		let index = focus ? entries.indexOf(focus) : -1; // TODO@Ben should not make ordering assumptions
		if (index >= 0) {
			if (!isShift) {
				for (let i = index + 1; i < entries.length; i++) {
					let nextGroupEntry = entries[i];
					if (nextGroupEntry instanceof QuickOpenEntryGroup && (<QuickOpenEntryGroup>nextGroupEntry).getGroupLabel()) {
						this.tree.setFocus(nextGroupEntry);
						return;
					}
				}
			} else {
				for (let i = index - 1; i >= 0; i--) {
					if (entries[i] instanceof QuickOpenEntryGroup && (<QuickOpenEntryGroup>entries[i]).getGroupLabel()) {
						this.tree.setFocus(entries[i]);
						return;
					}
				}
			}
		}

		// Focus first group unless shift is pressed
		if (!isShift) {
			this.tree.setFocus(entries[0]);
			return;
		}

		// Focus last group entry otherwise
		for (let i = entries.length - 1; i >= 0; i--) {
			if (entries[i] instanceof QuickOpenEntryGroup && (<QuickOpenEntryGroup>entries[i]).getGroupLabel()) {
				this.tree.setFocus(entries[i]);
				return;
			}
		}
	}*/

	private elementFocused(value: any, event?: any): void {
		if (!value || !this.isVisible()) {
			return;
		}

		const context: IContext = { event: event, quickNavigateConfiguration: this.quickNavigateConfiguration };
		this.model.runner.run(value, Mode.PREVIEW, context);
	}

	private elementSelected(value: any, event?: any): void {
		let hide = true;

		// Trigger open of element on selection
		if (this.isVisible()) {
			const context: IContext = { event: event, quickNavigateConfiguration: this.quickNavigateConfiguration };
			hide = this.model.runner.run(value, Mode.OPEN, context);
		}

		// add telemetry when an item is acceptted, logging the index of the item in the list and the length of the list
		// to measure the rate of the success and the relevance of the order
		if (this.usageLogger) {
			let indexOfAcceptedElement = this.model.entries.indexOf(value);
			let entriesCount = this.model.entries.length;
			this.usageLogger.publicLog('quickOpenWidgetItemAccepted', { index: indexOfAcceptedElement, count: entriesCount, isQuickNavigate: this.quickNavigateConfiguration ? true : false });
		}

		// Hide if command was run successfully
		if (hide) {
			this.hide();
		}
	}

	public show(prefix: string): void;
	public show(input: IModel<any>, autoFocus?: IAutoFocus, quickNavigateConfiguration?: IQuickNavigateConfiguration): void;
	public show(param: any, autoFocus?: IAutoFocus, quickNavigateConfiguration?: IQuickNavigateConfiguration): void {
		if (types.isUndefined(autoFocus)) {
			autoFocus = {};
		}

		this.visible = true;
		this.isLoosingFocus = false;
		this.quickNavigateConfiguration = quickNavigateConfiguration;

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
			this.doShowWithInput(param, autoFocus);
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
				this.tree.reveal(entryToFocus, 0);

				return;
			}
		}

		// Second check for auto focus of first entry
		if (autoFocus.autoFocusFirstEntry) {
			this.tree.focusFirst();
			this.tree.reveal(this.tree.getFocus(), 0);
		}

		// Third check for specific index option
		else if (typeof autoFocus.autoFocusIndex === 'number') {
			if (entries.length > autoFocus.autoFocusIndex) {
				this.tree.focusNth(autoFocus.autoFocusIndex);
				this.tree.reveal(this.tree.getFocus());
			}
		}

		// Finally check for auto focus of second entry
		else if (autoFocus.autoFocusSecondEntry) {
			if (entries.length > 1) {
				this.tree.focusNth(1);
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

				// Handle auto focus
				if (!this.tree.getFocus() && input && input.entries.some(e => this.isElementVisible(input, e))) {
					this.autoFocus(input, autoFocus);
				}
			}, errors.onUnexpectedError);
		});
	}

	private setTreeHeightForInput(input: IModel<any>): Promise {
		let newHeight = this.getHeight(input) + 'px';
		let oldHeight = this.treeContainer.style('height');

		// Apply
		this.treeContainer.style({ height: newHeight });

		// Return instantly if we dont CSS transition or the height is the same as old
		if (!this.treeContainer.hasClass('transition') || oldHeight === newHeight) {
			return Promise.as(null);
		}

		// Otherwise return promise that only fullfills when the CSS transition has ended
		return new Promise((c, e) => {
			let unbind: { (): void; }[] = [];
			let complete = false;
			let completeHandler = () => {
				if (!complete) {
					complete = true;

					while (unbind.length) {
						unbind.pop()();
					}

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

	public hide(isCancel: boolean = false): void {
		if (!this.isVisible()) {
			return;
		}

		this.visible = false;
		this.builder.hide();
		this.builder.domBlur();

		// report failure cases
		if (isCancel) {
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

		// Reset Tree Height
		this.treeContainer.style({ height: (this.options.minItemsToShow ? this.options.minItemsToShow * 24 : 0) + 'px' });

		// Clear any running Progress
		this.progressBar.stop().getContainer().hide();

		// Clear Focus
		if (this.tree.isDOMFocused()) {
			this.tree.DOMBlur();
		} else if (this.inputBox.hasFocus()) {
			this.inputBox.blur();
		}

		// Callbacks
		if (isCancel) {
			this.callbacks.onCancel();
		} else {
			this.callbacks.onOk();
		}

		if (this.callbacks.onHide) {
			this.callbacks.onHide();
		}
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

	public setInput(input: IModel<any>, autoFocus: IAutoFocus): void {
		if (!this.isVisible()) {
			return;
		}

		// Adapt tree height to entries and apply input
		this.setInputAndLayout(input, autoFocus);
	}

	public getInput(): IModel<any> {
		return this.tree.getInput();
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
			this.inputBox.focus(); // user clicked somewhere into quick open, so we restore focus to input
			return;
		}

		this.isLoosingFocus = true;
		Promise.timeout(0).then(() => {
			if (!this.isLoosingFocus) {
				return;
			}

			const veto = this.callbacks.onFocusLost && this.callbacks.onFocusLost();
			if (!veto) {
				this.hide(false /* Do not treat loosing focus as cancel! */);
			}
		});
	}

	public dispose(): void {
		while (this.toUnbind.length) {
			this.toUnbind.pop()();
		}

		this.progressBar.dispose();
		this.inputBox.dispose();
		this.tree.dispose();
	}
}