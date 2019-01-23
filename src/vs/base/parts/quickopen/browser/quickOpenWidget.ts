/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./quickopen';
import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import * as types from 'vs/base/common/types';
import { IQuickNavigateConfiguration, IAutoFocus, IEntryRunContext, IModel, Mode, IKeyMods } from 'vs/base/parts/quickopen/common/quickOpen';
import { Filter, Renderer, DataSource, IModelProvider, AccessibilityProvider } from 'vs/base/parts/quickopen/browser/quickOpenViewer';
import { ITree, ContextMenuEvent, IActionProvider, ITreeStyles, ITreeOptions, ITreeConfiguration } from 'vs/base/parts/tree/browser/tree';
import { InputBox, MessageType, IInputBoxStyles, IRange } from 'vs/base/browser/ui/inputbox/inputBox';
import Severity from 'vs/base/common/severity';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { DefaultController, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import * as DOM from 'vs/base/browser/dom';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { Color } from 'vs/base/common/color';
import { mixin } from 'vs/base/common/objects';
import { StandardMouseEvent, IMouseEvent } from 'vs/base/browser/mouseEvent';

export interface IQuickOpenCallbacks {
	onOk: () => void;
	onCancel: () => void;
	onType: (value: string) => void;
	onShow?: () => void;
	onHide?: (reason: HideReason) => void;
	onFocusLost?: () => boolean /* veto close */;
}

export interface IQuickOpenOptions extends IQuickOpenStyles {
	minItemsToShow?: number;
	maxItemsToShow?: number;
	inputPlaceHolder: string;
	inputAriaLabel?: string;
	actionProvider?: IActionProvider;
	keyboardSupport?: boolean;
	treeCreator?: (container: HTMLElement, configuration: ITreeConfiguration, options?: ITreeOptions) => ITree;
}

export interface IQuickOpenStyles extends IInputBoxStyles, ITreeStyles {
	background?: Color;
	foreground?: Color;
	borderColor?: Color;
	pickerGroupForeground?: Color;
	pickerGroupBorder?: Color;
	widgetShadow?: Color;
	progressBarBackground?: Color;
}

export interface IShowOptions {
	quickNavigateConfiguration?: IQuickNavigateConfiguration;
	autoFocus?: IAutoFocus;
	inputSelection?: IRange;
	value?: string;
}

export class QuickOpenController extends DefaultController {

	onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean {
		if (platform.isMacintosh) {
			return this.onLeftClick(tree, element, event); // https://github.com/Microsoft/vscode/issues/1011
		}

		return super.onContextMenu(tree, element, event);
	}

	onMouseMiddleClick(tree: ITree, element: any, event: IMouseEvent): boolean {
		return this.onLeftClick(tree, element, event);
	}
}

export const enum HideReason {
	ELEMENT_SELECTED,
	FOCUS_LOST,
	CANCELED
}

const defaultStyles = {
	background: Color.fromHex('#1E1E1E'),
	foreground: Color.fromHex('#CCCCCC'),
	pickerGroupForeground: Color.fromHex('#0097FB'),
	pickerGroupBorder: Color.fromHex('#3F3F46'),
	widgetShadow: Color.fromHex('#000000'),
	progressBarBackground: Color.fromHex('#0E70C0')
};

const DEFAULT_INPUT_ARIA_LABEL = nls.localize('quickOpenAriaLabel', "Quick picker. Type to narrow down results.");

export class QuickOpenWidget extends Disposable implements IModelProvider {

	private static readonly MAX_WIDTH = 600;			// Max total width of quick open widget
	private static readonly MAX_ITEMS_HEIGHT = 20 * 22;	// Max height of item list below input field

	private isDisposed: boolean;
	private options: IQuickOpenOptions;
	private element: HTMLElement;
	private tree: ITree;
	private inputBox: InputBox;
	private inputContainer: HTMLElement;
	private helpText: HTMLElement;
	private resultCount: HTMLElement;
	private treeContainer: HTMLElement;
	private progressBar: ProgressBar;
	private visible: boolean;
	private isLoosingFocus: boolean;
	private callbacks: IQuickOpenCallbacks;
	private quickNavigateConfiguration: IQuickNavigateConfiguration;
	private container: HTMLElement;
	private treeElement: HTMLElement;
	private inputElement: HTMLElement;
	private layoutDimensions: DOM.Dimension;
	private model: IModel<any>;
	private inputChangingTimeoutHandle: any;
	private styles: IQuickOpenStyles;
	private renderer: Renderer;

	constructor(container: HTMLElement, callbacks: IQuickOpenCallbacks, options: IQuickOpenOptions) {
		super();

		this.isDisposed = false;
		this.container = container;
		this.callbacks = callbacks;
		this.options = options;
		this.styles = options || Object.create(null);
		mixin(this.styles, defaultStyles, false);
		this.model = null;
	}

	getElement(): HTMLElement {
		return this.element;
	}

	getModel(): IModel<any> {
		return this.model;
	}

	setCallbacks(callbacks: IQuickOpenCallbacks): void {
		this.callbacks = callbacks;
	}

	create(): HTMLElement {

		// Container
		this.element = document.createElement('div');
		DOM.addClass(this.element, 'monaco-quick-open-widget');
		this.container.appendChild(this.element);

		this._register(DOM.addDisposableListener(this.element, DOM.EventType.CONTEXT_MENU, e => DOM.EventHelper.stop(e, true))); // Do this to fix an issue on Mac where the menu goes into the way
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.FOCUS, e => this.gainingFocus(), true));
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.BLUR, e => this.loosingFocus(e), true));
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, e => {
			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
			if (keyboardEvent.keyCode === KeyCode.Escape) {
				DOM.EventHelper.stop(e, true);

				this.hide(HideReason.CANCELED);
			} else if (keyboardEvent.keyCode === KeyCode.Tab && !keyboardEvent.altKey && !keyboardEvent.ctrlKey && !keyboardEvent.metaKey) {
				const stops = (e.currentTarget as HTMLElement).querySelectorAll('input, .monaco-tree, .monaco-tree-row.focused .action-label.icon') as NodeListOf<HTMLElement>;
				if (keyboardEvent.shiftKey && keyboardEvent.target === stops[0]) {
					DOM.EventHelper.stop(e, true);
					stops[stops.length - 1].focus();
				} else if (!keyboardEvent.shiftKey && keyboardEvent.target === stops[stops.length - 1]) {
					DOM.EventHelper.stop(e, true);
					stops[0].focus();
				}
			}
		}));

		// Progress Bar
		this.progressBar = this._register(new ProgressBar(this.element, { progressBarBackground: this.styles.progressBarBackground }));
		this.progressBar.hide();

		// Input Field
		this.inputContainer = document.createElement('div');
		DOM.addClass(this.inputContainer, 'quick-open-input');
		this.element.appendChild(this.inputContainer);

		this.inputBox = this._register(new InputBox(this.inputContainer, null, {
			placeholder: this.options.inputPlaceHolder || '',
			ariaLabel: DEFAULT_INPUT_ARIA_LABEL,
			inputBackground: this.styles.inputBackground,
			inputForeground: this.styles.inputForeground,
			inputBorder: this.styles.inputBorder,
			inputValidationInfoBackground: this.styles.inputValidationInfoBackground,
			inputValidationInfoForeground: this.styles.inputValidationInfoForeground,
			inputValidationInfoBorder: this.styles.inputValidationInfoBorder,
			inputValidationWarningBackground: this.styles.inputValidationWarningBackground,
			inputValidationWarningForeground: this.styles.inputValidationWarningForeground,
			inputValidationWarningBorder: this.styles.inputValidationWarningBorder,
			inputValidationErrorBackground: this.styles.inputValidationErrorBackground,
			inputValidationErrorForeground: this.styles.inputValidationErrorForeground,
			inputValidationErrorBorder: this.styles.inputValidationErrorBorder
		}));

		this.inputElement = this.inputBox.inputElement;
		this.inputElement.setAttribute('role', 'combobox');
		this.inputElement.setAttribute('aria-haspopup', 'false');
		this.inputElement.setAttribute('aria-autocomplete', 'list');

		this._register(DOM.addDisposableListener(this.inputBox.inputElement, DOM.EventType.INPUT, (e: Event) => this.onType()));
		this._register(DOM.addDisposableListener(this.inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
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

				// Position cursor at the end of input to allow right arrow (open in background)
				// to function immediately unless the user has made a selection
				if (this.inputBox.inputElement.selectionStart === this.inputBox.inputElement.selectionEnd) {
					this.inputBox.inputElement.selectionStart = this.inputBox.value.length;
				}
			}

			// Select element on Enter or on Arrow-Right if we are at the end of the input
			else if (keyboardEvent.keyCode === KeyCode.Enter || shouldOpenInBackground) {
				DOM.EventHelper.stop(e, true);

				const focus = this.tree.getFocus();
				if (focus) {
					this.elementSelected(focus, e, shouldOpenInBackground ? Mode.OPEN_IN_BACKGROUND : Mode.OPEN);
				}
			}
		}));

		// Result count for screen readers
		this.resultCount = document.createElement('div');
		DOM.addClass(this.resultCount, 'quick-open-result-count');
		this.resultCount.setAttribute('aria-live', 'polite');
		this.resultCount.setAttribute('aria-atomic', 'true');
		this.element.appendChild(this.resultCount);

		// Tree
		this.treeContainer = document.createElement('div');
		DOM.addClass(this.treeContainer, 'quick-open-tree');
		this.element.appendChild(this.treeContainer);

		const createTree = this.options.treeCreator || ((container, config, opts) => new Tree(container, config, opts));

		this.tree = this._register(createTree(this.treeContainer, {
			dataSource: new DataSource(this),
			controller: new QuickOpenController({ clickBehavior: ClickBehavior.ON_MOUSE_UP, keyboardSupport: this.options.keyboardSupport }),
			renderer: (this.renderer = new Renderer(this, this.styles)),
			filter: new Filter(this),
			accessibilityProvider: new AccessibilityProvider(this)
		}, {
				twistiePixels: 11,
				indentPixels: 0,
				alwaysFocused: true,
				verticalScrollMode: ScrollbarVisibility.Visible,
				horizontalScrollMode: ScrollbarVisibility.Hidden,
				ariaLabel: nls.localize('treeAriaLabel', "Quick Picker"),
				keyboardSupport: this.options.keyboardSupport,
				preventRootFocus: false
			}));

		this.treeElement = this.tree.getHTMLElement();

		// Handle Focus and Selection event
		this._register(this.tree.onDidChangeFocus(event => {
			this.elementFocused(event.focus, event);
		}));

		this._register(this.tree.onDidChangeSelection(event => {
			if (event.selection && event.selection.length > 0) {
				const mouseEvent: StandardMouseEvent = event.payload && event.payload.originalEvent instanceof StandardMouseEvent ? event.payload.originalEvent : undefined;
				const shouldOpenInBackground = mouseEvent ? this.shouldOpenInBackground(mouseEvent) : false;

				this.elementSelected(event.selection[0], event, shouldOpenInBackground ? Mode.OPEN_IN_BACKGROUND : Mode.OPEN);
			}
		}));

		this._register(DOM.addDisposableListener(this.treeContainer, DOM.EventType.KEY_DOWN, e => {
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
		}));

		this._register(DOM.addDisposableListener(this.treeContainer, DOM.EventType.KEY_UP, e => {
			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
			const keyCode = keyboardEvent.keyCode;

			// Only handle when in quick navigation mode
			if (!this.quickNavigateConfiguration) {
				return;
			}

			// Select element when keys are pressed that signal it
			const quickNavKeys = this.quickNavigateConfiguration.keybindings;
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
				const focus = this.tree.getFocus();
				if (focus) {
					this.elementSelected(focus, e);
				}
			}
		}));

		// Support layout
		if (this.layoutDimensions) {
			this.layout(this.layoutDimensions);
		}

		this.applyStyles();

		// Allows focus to switch to next/previous entry after tab into an actionbar item
		this._register(DOM.addDisposableListener(this.treeContainer, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			const keyboardEvent: StandardKeyboardEvent = new StandardKeyboardEvent(e);
			// Only handle when not in quick navigation mode
			if (this.quickNavigateConfiguration) {
				return;
			}
			if (keyboardEvent.keyCode === KeyCode.DownArrow || keyboardEvent.keyCode === KeyCode.UpArrow || keyboardEvent.keyCode === KeyCode.PageDown || keyboardEvent.keyCode === KeyCode.PageUp) {
				DOM.EventHelper.stop(e, true);
				this.navigateInTree(keyboardEvent.keyCode, keyboardEvent.shiftKey);
				this.treeElement.focus();
			}
		}));

		return this.element;
	}

	style(styles: IQuickOpenStyles): void {
		this.styles = styles;

		this.applyStyles();
	}

	protected applyStyles(): void {
		if (this.element) {
			const foreground = this.styles.foreground ? this.styles.foreground.toString() : null;
			const background = this.styles.background ? this.styles.background.toString() : null;
			const borderColor = this.styles.borderColor ? this.styles.borderColor.toString() : null;
			const widgetShadow = this.styles.widgetShadow ? this.styles.widgetShadow.toString() : null;

			this.element.style.color = foreground;
			this.element.style.backgroundColor = background;
			this.element.style.borderColor = borderColor;
			this.element.style.borderWidth = borderColor ? '1px' : null;
			this.element.style.borderStyle = borderColor ? 'solid' : null;
			this.element.style.boxShadow = widgetShadow ? `0 5px 8px ${widgetShadow}` : null;
		}

		if (this.progressBar) {
			this.progressBar.style({
				progressBarBackground: this.styles.progressBarBackground
			});
		}

		if (this.inputBox) {
			this.inputBox.style({
				inputBackground: this.styles.inputBackground,
				inputForeground: this.styles.inputForeground,
				inputBorder: this.styles.inputBorder,
				inputValidationInfoBackground: this.styles.inputValidationInfoBackground,
				inputValidationInfoForeground: this.styles.inputValidationInfoForeground,
				inputValidationInfoBorder: this.styles.inputValidationInfoBorder,
				inputValidationWarningBackground: this.styles.inputValidationWarningBackground,
				inputValidationWarningForeground: this.styles.inputValidationWarningForeground,
				inputValidationWarningBorder: this.styles.inputValidationWarningBorder,
				inputValidationErrorBackground: this.styles.inputValidationErrorBackground,
				inputValidationErrorForeground: this.styles.inputValidationErrorForeground,
				inputValidationErrorBorder: this.styles.inputValidationErrorBorder
			});
		}

		if (this.tree && !this.options.treeCreator) {
			this.tree.style(this.styles);
		}

		if (this.renderer) {
			this.renderer.updateStyles(this.styles);
		}
	}

	private shouldOpenInBackground(e: StandardKeyboardEvent | StandardMouseEvent): boolean {

		// Keyboard
		if (e instanceof StandardKeyboardEvent) {
			if (e.keyCode !== KeyCode.RightArrow) {
				return false; // only for right arrow
			}

			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
				return false; // no modifiers allowed
			}

			// validate the cursor is at the end of the input and there is no selection,
			// and if not prevent opening in the background such as the selection can be changed
			const element = this.inputBox.inputElement;
			return element.selectionEnd === this.inputBox.value.length && element.selectionStart === element.selectionEnd;
		}

		// Mouse
		return e.middleButton;
	}

	private onType(): void {
		const value = this.inputBox.value;

		// Adjust help text as needed if present
		if (this.helpText) {
			if (value) {
				DOM.hide(this.helpText);
			} else {
				DOM.show(this.helpText);
			}
		}

		// Send to callbacks
		this.callbacks.onType(value);
	}

	navigate(next: boolean, quickNavigate?: IQuickNavigateConfiguration): void {
		if (this.isVisible()) {

			// Transition into quick navigate mode if not yet done
			if (!this.quickNavigateConfiguration && quickNavigate) {
				this.quickNavigateConfiguration = quickNavigate;
				this.tree.domFocus();
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
			this.tree.reveal(newFocus);
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

		// Hide if command was run successfully
		if (hide) {
			this.hide(HideReason.ELEMENT_SELECTED);
		}
	}

	private extractKeyMods(event: any): IKeyMods {
		return {
			ctrlCmd: event && (event.ctrlKey || event.metaKey || (event.payload && event.payload.originalEvent && (event.payload.originalEvent.ctrlKey || event.payload.originalEvent.metaKey))),
			alt: event && (event.altKey || (event.payload && event.payload.originalEvent && event.payload.originalEvent.altKey))
		};
	}

	show(prefix: string, options?: IShowOptions): void;
	show(input: IModel<any>, options?: IShowOptions): void;
	show(param: any, options?: IShowOptions): void {
		this.visible = true;
		this.isLoosingFocus = false;
		this.quickNavigateConfiguration = options ? options.quickNavigateConfiguration : undefined;

		// Adjust UI for quick navigate mode
		if (this.quickNavigateConfiguration) {
			DOM.hide(this.inputContainer);
			DOM.show(this.element);
			this.tree.domFocus();
		}

		// Otherwise use normal UI
		else {
			DOM.show(this.inputContainer);
			DOM.show(this.element);
			this.inputBox.focus();
		}

		// Adjust Help text for IE
		if (this.helpText) {
			if (this.quickNavigateConfiguration || types.isString(param)) {
				DOM.hide(this.helpText);
			} else {
				DOM.show(this.helpText);
			}
		}

		// Show based on param
		if (types.isString(param)) {
			this.doShowWithPrefix(param);
		} else {
			if (options.value) {
				this.restoreLastInput(options.value);
			}
			this.doShowWithInput(param, options && options.autoFocus ? options.autoFocus : {});
		}

		// Respect selectAll option
		if (options && options.inputSelection && !this.quickNavigateConfiguration) {
			this.inputBox.select(options.inputSelection);
		}

		if (this.callbacks.onShow) {
			this.callbacks.onShow();
		}
	}

	private restoreLastInput(lastInput: string) {
		this.inputBox.value = lastInput;
		this.inputBox.select();
		this.callbacks.onType(lastInput);
	}

	private doShowWithPrefix(prefix: string): void {
		this.inputBox.value = prefix;
		this.callbacks.onType(prefix);
	}

	private doShowWithInput(input: IModel<any>, autoFocus: IAutoFocus): void {
		this.setInput(input, autoFocus);
	}

	private setInputAndLayout(input: IModel<any>, autoFocus: IAutoFocus): void {
		this.treeContainer.style.height = `${this.getHeight(input)}px`;

		this.tree.setInput(null).then(() => {
			this.model = input;

			// ARIA
			this.inputElement.setAttribute('aria-haspopup', String(input && input.entries && input.entries.length > 0));

			return this.tree.setInput(input);
		}).then(() => {

			// Indicate entries to tree
			this.tree.layout();

			const entries = input ? input.entries.filter(e => this.isElementVisible(input, e)) : [];
			this.updateResultCount(entries.length);

			// Handle auto focus
			if (entries.length) {
				this.autoFocus(input, entries, autoFocus);
			}
		});
	}

	private isElementVisible<T>(input: IModel<T>, e: T): boolean {
		if (!input.filter) {
			return true;
		}

		return input.filter.isVisible(e);
	}

	private autoFocus(input: IModel<any>, entries: any[], autoFocus: IAutoFocus = {}): void {

		// First check for auto focus of prefix matches
		if (autoFocus.autoFocusPrefixMatch) {
			let caseSensitiveMatch: any;
			let caseInsensitiveMatch: any;
			const prefix = autoFocus.autoFocusPrefixMatch;
			const lowerCasePrefix = prefix.toLowerCase();
			for (const entry of entries) {
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
				this.tree.reveal(entryToFocus, 0.5);

				return;
			}
		}

		// Second check for auto focus of first entry
		if (autoFocus.autoFocusFirstEntry) {
			this.tree.focusFirst();
			this.tree.reveal(this.tree.getFocus());
		}

		// Third check for specific index option
		else if (typeof autoFocus.autoFocusIndex === 'number') {
			if (entries.length > autoFocus.autoFocusIndex) {
				this.tree.focusNth(autoFocus.autoFocusIndex);
				this.tree.reveal(this.tree.getFocus());
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

	refresh(input?: IModel<any>, autoFocus?: IAutoFocus): void {
		if (!this.isVisible()) {
			return;
		}

		if (!input) {
			input = this.tree.getInput();
		}

		if (!input) {
			return;
		}

		// Apply height & Refresh
		this.treeContainer.style.height = `${this.getHeight(input)}px`;
		this.tree.refresh().then(() => {

			// Indicate entries to tree
			this.tree.layout();

			const entries = input ? input.entries.filter(e => this.isElementVisible(input, e)) : [];
			this.updateResultCount(entries.length);

			// Handle auto focus
			if (autoFocus) {
				if (entries.length) {
					this.autoFocus(input, entries, autoFocus);
				}
			}
		});
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
			preferredItemsHeight = (this.layoutDimensions.height - 50 /* subtract height of input field (30px) and some spacing (drop shadow) to fit */) * 0.4 /* max 40% of screen */;
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

	updateResultCount(count: number) {
		this.resultCount.textContent = nls.localize({ key: 'quickInput.visibleCount', comment: ['This tells the user how many items are shown in a list of items to select from. The items can be anything. Currently not visible, but read by screen readers.'] }, "{0} Results", count);
	}

	hide(reason?: HideReason): void {
		if (!this.isVisible()) {
			return;
		}

		this.visible = false;
		DOM.hide(this.element);
		this.element.blur();

		// Clear input field and clear tree
		this.inputBox.value = '';
		this.tree.setInput(null);

		// ARIA
		this.inputElement.setAttribute('aria-haspopup', 'false');

		// Reset Tree Height
		this.treeContainer.style.height = `${this.options.minItemsToShow ? this.options.minItemsToShow * 22 : 0}px`;

		// Clear any running Progress
		this.progressBar.stop().hide();

		// Clear Focus
		if (this.tree.isDOMFocused()) {
			this.tree.domBlur();
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

	getQuickNavigateConfiguration(): IQuickNavigateConfiguration {
		return this.quickNavigateConfiguration;
	}

	setPlaceHolder(placeHolder: string): void {
		if (this.inputBox) {
			this.inputBox.setPlaceHolder(placeHolder);
		}
	}

	setValue(value: string, selectionOrStableHint?: [number, number] | null): void {
		if (this.inputBox) {
			this.inputBox.value = value;
			if (selectionOrStableHint === null) {
				// null means stable-selection
			} else if (Array.isArray(selectionOrStableHint)) {
				const [start, end] = selectionOrStableHint;
				this.inputBox.select({ start, end });
			} else {
				this.inputBox.select();
			}
		}
	}

	setPassword(isPassword: boolean): void {
		if (this.inputBox) {
			this.inputBox.inputElement.type = isPassword ? 'password' : 'text';
		}
	}

	setInput(input: IModel<any>, autoFocus: IAutoFocus, ariaLabel?: string): void {
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
		DOM.addClass(this.element, 'content-changing');
		this.inputChangingTimeoutHandle = setTimeout(() => {
			DOM.removeClass(this.element, 'content-changing');
		}, 500);
	}

	getInput(): IModel<any> {
		return this.tree.getInput();
	}

	showInputDecoration(decoration: Severity): void {
		if (this.inputBox) {
			this.inputBox.showMessage({ type: decoration === Severity.Info ? MessageType.INFO : decoration === Severity.Warning ? MessageType.WARNING : MessageType.ERROR, content: '' });
		}
	}

	clearInputDecoration(): void {
		if (this.inputBox) {
			this.inputBox.hideMessage();
		}
	}

	focus(): void {
		if (this.isVisible() && this.inputBox) {
			this.inputBox.focus();
		}
	}

	accept(): void {
		if (this.isVisible()) {
			const focus = this.tree.getFocus();
			if (focus) {
				this.elementSelected(focus);
			}
		}
	}

	getProgressBar(): ProgressBar {
		return this.progressBar;
	}

	getInputBox(): InputBox {
		return this.inputBox;
	}

	setExtraClass(clazz: string): void {
		const previousClass = this.element.getAttribute('quick-open-extra-class');
		if (previousClass) {
			DOM.removeClasses(this.element, previousClass);
		}

		if (clazz) {
			DOM.addClasses(this.element, clazz);
			this.element.setAttribute('quick-open-extra-class', clazz);
		} else if (previousClass) {
			this.element.removeAttribute('quick-open-extra-class');
		}
	}

	isVisible(): boolean {
		return this.visible;
	}

	layout(dimension: DOM.Dimension): void {
		this.layoutDimensions = dimension;

		// Apply to quick open width (height is dynamic by number of items to show)
		const quickOpenWidth = Math.min(this.layoutDimensions.width * 0.62 /* golden cut */, QuickOpenWidget.MAX_WIDTH);
		if (this.element) {

			// quick open
			this.element.style.width = `${quickOpenWidth}px`;
			this.element.style.marginLeft = `-${quickOpenWidth / 2}px`;

			// input field
			this.inputContainer.style.width = `${quickOpenWidth - 12}px`;
		}
	}

	private gainingFocus(): void {
		this.isLoosingFocus = false;
	}

	private loosingFocus(e: FocusEvent): void {
		if (!this.isVisible()) {
			return;
		}

		const relatedTarget = e.relatedTarget as HTMLElement;
		if (!this.quickNavigateConfiguration && DOM.isAncestor(relatedTarget, this.element)) {
			return; // user clicked somewhere into quick open widget, do not close thereby
		}

		this.isLoosingFocus = true;
		setTimeout(() => {
			if (!this.isLoosingFocus || this.isDisposed) {
				return;
			}

			const veto = this.callbacks.onFocusLost && this.callbacks.onFocusLost();
			if (!veto) {
				this.hide(HideReason.FOCUS_LOST);
			}
		}, 0);
	}

	dispose(): void {
		super.dispose();

		this.isDisposed = true;
	}
}
