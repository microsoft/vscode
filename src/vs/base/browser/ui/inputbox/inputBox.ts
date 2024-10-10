/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../dom.js';
import * as cssJs from '../../cssValue.js';
import { DomEmitter } from '../../event.js';
import { renderFormattedText, renderText } from '../../formattedTextRenderer.js';
import { IHistoryNavigationWidget } from '../../history.js';
import { MarkdownRenderOptions } from '../../markdownRenderer.js';
import { ActionBar } from '../actionbar/actionbar.js';
import * as aria from '../aria/aria.js';
import { AnchorAlignment, IContextViewProvider } from '../contextview/contextview.js';
import type { IManagedHover } from '../hover/hover.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../hover/hoverDelegateFactory.js';
import { ScrollableElement } from '../scrollbar/scrollableElement.js';
import { Widget } from '../widget.js';
import { IAction } from '../../../common/actions.js';
import { Emitter, Event } from '../../../common/event.js';
import { HistoryNavigator } from '../../../common/history.js';
import { equals } from '../../../common/objects.js';
import { ScrollbarVisibility } from '../../../common/scrollable.js';
import './inputBox.css';
import * as nls from '../../../../nls.js';


const $ = dom.$;

export interface IInputOptions {
	readonly placeholder?: string;
	readonly showPlaceholderOnFocus?: boolean;
	readonly tooltip?: string;
	readonly ariaLabel?: string;
	readonly type?: string;
	readonly validationOptions?: IInputValidationOptions;
	readonly flexibleHeight?: boolean;
	readonly flexibleWidth?: boolean;
	readonly flexibleMaxHeight?: number;
	readonly actions?: ReadonlyArray<IAction>;
	readonly inputBoxStyles: IInputBoxStyles;
}

export interface IInputBoxStyles {
	readonly inputBackground: string | undefined;
	readonly inputForeground: string | undefined;
	readonly inputBorder: string | undefined;
	readonly inputValidationInfoBorder: string | undefined;
	readonly inputValidationInfoBackground: string | undefined;
	readonly inputValidationInfoForeground: string | undefined;
	readonly inputValidationWarningBorder: string | undefined;
	readonly inputValidationWarningBackground: string | undefined;
	readonly inputValidationWarningForeground: string | undefined;
	readonly inputValidationErrorBorder: string | undefined;
	readonly inputValidationErrorBackground: string | undefined;
	readonly inputValidationErrorForeground: string | undefined;
}

export interface IInputValidator {
	(value: string): IMessage | null;
}

export interface IMessage {
	readonly content?: string;
	readonly formatContent?: boolean; // defaults to false
	readonly type?: MessageType;
}

export interface IInputValidationOptions {
	validation?: IInputValidator;
}

export const enum MessageType {
	INFO = 1,
	WARNING = 2,
	ERROR = 3
}

export interface IRange {
	start: number;
	end: number;
}

export const unthemedInboxStyles: IInputBoxStyles = {
	inputBackground: '#3C3C3C',
	inputForeground: '#CCCCCC',
	inputValidationInfoBorder: '#55AAFF',
	inputValidationInfoBackground: '#063B49',
	inputValidationWarningBorder: '#B89500',
	inputValidationWarningBackground: '#352A05',
	inputValidationErrorBorder: '#BE1100',
	inputValidationErrorBackground: '#5A1D1D',
	inputBorder: undefined,
	inputValidationErrorForeground: undefined,
	inputValidationInfoForeground: undefined,
	inputValidationWarningForeground: undefined
};

export class InputBox extends Widget {
	private contextViewProvider?: IContextViewProvider;
	element: HTMLElement;
	protected input: HTMLInputElement;
	private actionbar?: ActionBar;
	private readonly options: IInputOptions;
	private message: IMessage | null;
	protected placeholder: string;
	private tooltip: string;
	private ariaLabel: string;
	private validation?: IInputValidator;
	private state: 'idle' | 'open' | 'closed' = 'idle';

	private mirror: HTMLElement | undefined;
	private cachedHeight: number | undefined;
	private cachedContentHeight: number | undefined;
	private maxHeight: number = Number.POSITIVE_INFINITY;
	private scrollableElement: ScrollableElement | undefined;
	private hover: IManagedHover | undefined;

	private _onDidChange = this._register(new Emitter<string>());
	public readonly onDidChange: Event<string> = this._onDidChange.event;

	private _onDidHeightChange = this._register(new Emitter<number>());
	public readonly onDidHeightChange: Event<number> = this._onDidHeightChange.event;

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider | undefined, options: IInputOptions) {
		super();

		this.contextViewProvider = contextViewProvider;
		this.options = options;

		this.message = null;
		this.placeholder = this.options.placeholder || '';
		this.tooltip = this.options.tooltip ?? (this.placeholder || '');
		this.ariaLabel = this.options.ariaLabel || '';

		if (this.options.validationOptions) {
			this.validation = this.options.validationOptions.validation;
		}

		this.element = dom.append(container, $('.monaco-inputbox.idle'));

		const tagName = this.options.flexibleHeight ? 'textarea' : 'input';

		const wrapper = dom.append(this.element, $('.ibwrapper'));
		this.input = dom.append(wrapper, $(tagName + '.input.empty'));
		this.input.setAttribute('autocorrect', 'off');
		this.input.setAttribute('autocapitalize', 'off');
		this.input.setAttribute('spellcheck', 'false');

		this.onfocus(this.input, () => this.element.classList.add('synthetic-focus'));
		this.onblur(this.input, () => this.element.classList.remove('synthetic-focus'));

		if (this.options.flexibleHeight) {
			this.maxHeight = typeof this.options.flexibleMaxHeight === 'number' ? this.options.flexibleMaxHeight : Number.POSITIVE_INFINITY;

			this.mirror = dom.append(wrapper, $('div.mirror'));
			this.mirror.innerText = '\u00a0';

			this.scrollableElement = new ScrollableElement(this.element, { vertical: ScrollbarVisibility.Auto });

			if (this.options.flexibleWidth) {
				this.input.setAttribute('wrap', 'off');
				this.mirror.style.whiteSpace = 'pre';
				this.mirror.style.wordWrap = 'initial';
			}

			dom.append(container, this.scrollableElement.getDomNode());
			this._register(this.scrollableElement);

			// from ScrollableElement to DOM
			this._register(this.scrollableElement.onScroll(e => this.input.scrollTop = e.scrollTop));

			const onSelectionChange = this._register(new DomEmitter(container.ownerDocument, 'selectionchange'));
			const onAnchoredSelectionChange = Event.filter(onSelectionChange.event, () => {
				const selection = container.ownerDocument.getSelection();
				return selection?.anchorNode === wrapper;
			});

			// from DOM to ScrollableElement
			this._register(onAnchoredSelectionChange(this.updateScrollDimensions, this));
			this._register(this.onDidHeightChange(this.updateScrollDimensions, this));
		} else {
			this.input.type = this.options.type || 'text';
			this.input.setAttribute('wrap', 'off');
		}

		if (this.ariaLabel) {
			this.input.setAttribute('aria-label', this.ariaLabel);
		}

		if (this.placeholder && !this.options.showPlaceholderOnFocus) {
			this.setPlaceHolder(this.placeholder);
		}

		if (this.tooltip) {
			this.setTooltip(this.tooltip);
		}

		this.oninput(this.input, () => this.onValueChange());
		this.onblur(this.input, () => this.onBlur());
		this.onfocus(this.input, () => this.onFocus());

		this._register(this.ignoreGesture(this.input));

		setTimeout(() => this.updateMirror(), 0);

		// Support actions
		if (this.options.actions) {
			this.actionbar = this._register(new ActionBar(this.element));
			this.actionbar.push(this.options.actions, { icon: true, label: false });
		}

		this.applyStyles();
	}

	protected onBlur(): void {
		this._hideMessage();
		if (this.options.showPlaceholderOnFocus) {
			this.input.setAttribute('placeholder', '');
		}
	}

	protected onFocus(): void {
		this._showMessage();
		if (this.options.showPlaceholderOnFocus) {
			this.input.setAttribute('placeholder', this.placeholder || '');
		}
	}

	public setPlaceHolder(placeHolder: string): void {
		this.placeholder = placeHolder;
		this.input.setAttribute('placeholder', placeHolder);
	}

	public setTooltip(tooltip: string): void {
		this.tooltip = tooltip;
		if (!this.hover) {
			this.hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate('mouse'), this.input, tooltip));
		} else {
			this.hover.update(tooltip);
		}
	}

	public setAriaLabel(label: string): void {
		this.ariaLabel = label;

		if (label) {
			this.input.setAttribute('aria-label', this.ariaLabel);
		} else {
			this.input.removeAttribute('aria-label');
		}
	}

	public getAriaLabel(): string {
		return this.ariaLabel;
	}

	public get mirrorElement(): HTMLElement | undefined {
		return this.mirror;
	}

	public get inputElement(): HTMLInputElement {
		return this.input;
	}

	public get value(): string {
		return this.input.value;
	}

	public set value(newValue: string) {
		if (this.input.value !== newValue) {
			this.input.value = newValue;
			this.onValueChange();
		}
	}

	public get step(): string {
		return this.input.step;
	}

	public set step(newValue: string) {
		this.input.step = newValue;
	}

	public get height(): number {
		return typeof this.cachedHeight === 'number' ? this.cachedHeight : dom.getTotalHeight(this.element);
	}

	public focus(): void {
		this.input.focus();
	}

	public blur(): void {
		this.input.blur();
	}

	public hasFocus(): boolean {
		return dom.isActiveElement(this.input);
	}

	public select(range: IRange | null = null): void {
		this.input.select();

		if (range) {
			this.input.setSelectionRange(range.start, range.end);
			if (range.end === this.input.value.length) {
				this.input.scrollLeft = this.input.scrollWidth;
			}
		}
	}

	public isSelectionAtEnd(): boolean {
		return this.input.selectionEnd === this.input.value.length && this.input.selectionStart === this.input.selectionEnd;
	}

	public getSelection(): IRange | null {
		const selectionStart = this.input.selectionStart;
		if (selectionStart === null) {
			return null;
		}
		const selectionEnd = this.input.selectionEnd ?? selectionStart;
		return {
			start: selectionStart,
			end: selectionEnd,
		};
	}

	public enable(): void {
		this.input.removeAttribute('disabled');
	}

	public disable(): void {
		this.blur();
		this.input.disabled = true;
		this._hideMessage();
	}

	public setEnabled(enabled: boolean): void {
		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	public get width(): number {
		return dom.getTotalWidth(this.input);
	}

	public set width(width: number) {
		if (this.options.flexibleHeight && this.options.flexibleWidth) {
			// textarea with horizontal scrolling
			let horizontalPadding = 0;
			if (this.mirror) {
				const paddingLeft = parseFloat(this.mirror.style.paddingLeft || '') || 0;
				const paddingRight = parseFloat(this.mirror.style.paddingRight || '') || 0;
				horizontalPadding = paddingLeft + paddingRight;
			}
			this.input.style.width = (width - horizontalPadding) + 'px';
		} else {
			this.input.style.width = width + 'px';
		}

		if (this.mirror) {
			this.mirror.style.width = width + 'px';
		}
	}

	public set paddingRight(paddingRight: number) {
		// Set width to avoid hint text overlapping buttons
		this.input.style.width = `calc(100% - ${paddingRight}px)`;

		if (this.mirror) {
			this.mirror.style.paddingRight = paddingRight + 'px';
		}
	}

	private updateScrollDimensions(): void {
		if (typeof this.cachedContentHeight !== 'number' || typeof this.cachedHeight !== 'number' || !this.scrollableElement) {
			return;
		}

		const scrollHeight = this.cachedContentHeight;
		const height = this.cachedHeight;
		const scrollTop = this.input.scrollTop;

		this.scrollableElement.setScrollDimensions({ scrollHeight, height });
		this.scrollableElement.setScrollPosition({ scrollTop });
	}

	public showMessage(message: IMessage, force?: boolean): void {
		if (this.state === 'open' && equals(this.message, message)) {
			// Already showing
			return;
		}

		this.message = message;

		this.element.classList.remove('idle');
		this.element.classList.remove('info');
		this.element.classList.remove('warning');
		this.element.classList.remove('error');
		this.element.classList.add(this.classForType(message.type));

		const styles = this.stylesForType(this.message.type);
		this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(styles.border, 'transparent')}`;

		if (this.message.content && (this.hasFocus() || force)) {
			this._showMessage();
		}
	}

	public hideMessage(): void {
		this.message = null;

		this.element.classList.remove('info');
		this.element.classList.remove('warning');
		this.element.classList.remove('error');
		this.element.classList.add('idle');

		this._hideMessage();
		this.applyStyles();
	}

	public isInputValid(): boolean {
		return !!this.validation && !this.validation(this.value);
	}

	public validate(): MessageType | undefined {
		let errorMsg: IMessage | null = null;

		if (this.validation) {
			errorMsg = this.validation(this.value);

			if (errorMsg) {
				this.inputElement.setAttribute('aria-invalid', 'true');
				this.showMessage(errorMsg);
			}
			else if (this.inputElement.hasAttribute('aria-invalid')) {
				this.inputElement.removeAttribute('aria-invalid');
				this.hideMessage();
			}
		}

		return errorMsg?.type;
	}

	public stylesForType(type: MessageType | undefined): { border: string | undefined; background: string | undefined; foreground: string | undefined } {
		const styles = this.options.inputBoxStyles;
		switch (type) {
			case MessageType.INFO: return { border: styles.inputValidationInfoBorder, background: styles.inputValidationInfoBackground, foreground: styles.inputValidationInfoForeground };
			case MessageType.WARNING: return { border: styles.inputValidationWarningBorder, background: styles.inputValidationWarningBackground, foreground: styles.inputValidationWarningForeground };
			default: return { border: styles.inputValidationErrorBorder, background: styles.inputValidationErrorBackground, foreground: styles.inputValidationErrorForeground };
		}
	}

	private classForType(type: MessageType | undefined): string {
		switch (type) {
			case MessageType.INFO: return 'info';
			case MessageType.WARNING: return 'warning';
			default: return 'error';
		}
	}

	private _showMessage(): void {
		if (!this.contextViewProvider || !this.message) {
			return;
		}

		let div: HTMLElement;
		const layout = () => div.style.width = dom.getTotalWidth(this.element) + 'px';

		this.contextViewProvider.showContextView({
			getAnchor: () => this.element,
			anchorAlignment: AnchorAlignment.RIGHT,
			render: (container: HTMLElement) => {
				if (!this.message) {
					return null;
				}

				div = dom.append(container, $('.monaco-inputbox-container'));
				layout();

				const renderOptions: MarkdownRenderOptions = {
					inline: true,
					className: 'monaco-inputbox-message'
				};

				const spanElement = (this.message.formatContent
					? renderFormattedText(this.message.content!, renderOptions)
					: renderText(this.message.content!, renderOptions));
				spanElement.classList.add(this.classForType(this.message.type));

				const styles = this.stylesForType(this.message.type);
				spanElement.style.backgroundColor = styles.background ?? '';
				spanElement.style.color = styles.foreground ?? '';
				spanElement.style.border = styles.border ? `1px solid ${styles.border}` : '';

				dom.append(div, spanElement);

				return null;
			},
			onHide: () => {
				this.state = 'closed';
			},
			layout: layout
		});

		// ARIA Support
		let alertText: string;
		if (this.message.type === MessageType.ERROR) {
			alertText = nls.localize('alertErrorMessage', "Error: {0}", this.message.content);
		} else if (this.message.type === MessageType.WARNING) {
			alertText = nls.localize('alertWarningMessage', "Warning: {0}", this.message.content);
		} else {
			alertText = nls.localize('alertInfoMessage', "Info: {0}", this.message.content);
		}

		aria.alert(alertText);

		this.state = 'open';
	}

	private _hideMessage(): void {
		if (!this.contextViewProvider) {
			return;
		}

		if (this.state === 'open') {
			this.contextViewProvider.hideContextView();
		}

		this.state = 'idle';
	}

	private onValueChange(): void {
		this._onDidChange.fire(this.value);

		this.validate();
		this.updateMirror();
		this.input.classList.toggle('empty', !this.value);

		if (this.state === 'open' && this.contextViewProvider) {
			this.contextViewProvider.layout();
		}
	}

	private updateMirror(): void {
		if (!this.mirror) {
			return;
		}

		const value = this.value;
		const lastCharCode = value.charCodeAt(value.length - 1);
		const suffix = lastCharCode === 10 ? ' ' : '';
		const mirrorTextContent = (value + suffix)
			.replace(/\u000c/g, ''); // Don't measure with the form feed character, which messes up sizing

		if (mirrorTextContent) {
			this.mirror.textContent = value + suffix;
		} else {
			this.mirror.innerText = '\u00a0';
		}

		this.layout();
	}

	protected applyStyles(): void {
		const styles = this.options.inputBoxStyles;

		const background = styles.inputBackground ?? '';
		const foreground = styles.inputForeground ?? '';
		const border = styles.inputBorder ?? '';

		this.element.style.backgroundColor = background;
		this.element.style.color = foreground;
		this.input.style.backgroundColor = 'inherit';
		this.input.style.color = foreground;

		// there's always a border, even if the color is not set.
		this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(border, 'transparent')}`;
	}

	public layout(): void {
		if (!this.mirror) {
			return;
		}

		const previousHeight = this.cachedContentHeight;
		this.cachedContentHeight = dom.getTotalHeight(this.mirror);

		if (previousHeight !== this.cachedContentHeight) {
			this.cachedHeight = Math.min(this.cachedContentHeight, this.maxHeight);
			this.input.style.height = this.cachedHeight + 'px';
			this._onDidHeightChange.fire(this.cachedContentHeight);
		}
	}

	public insertAtCursor(text: string): void {
		const inputElement = this.inputElement;
		const start = inputElement.selectionStart;
		const end = inputElement.selectionEnd;
		const content = inputElement.value;

		if (start !== null && end !== null) {
			this.value = content.substr(0, start) + text + content.substr(end);
			inputElement.setSelectionRange(start + 1, start + 1);
			this.layout();
		}
	}

	public override dispose(): void {
		this._hideMessage();

		this.message = null;

		this.actionbar?.dispose();

		super.dispose();
	}
}

export interface IHistoryInputOptions extends IInputOptions {
	history: string[];
	readonly showHistoryHint?: () => boolean;
}

export class HistoryInputBox extends InputBox implements IHistoryNavigationWidget {

	private readonly history: HistoryNavigator<string>;
	private observer: MutationObserver | undefined;

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private readonly _onDidBlur = this._register(new Emitter<void>());
	readonly onDidBlur = this._onDidBlur.event;

	constructor(container: HTMLElement, contextViewProvider: IContextViewProvider | undefined, options: IHistoryInputOptions) {
		const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS = nls.localize({
			key: 'history.inputbox.hint.suffix.noparens',
			comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field ends in a closing parenthesis ")", for example "Filter (e.g. text, !exclude)". The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
		}, ' or {0} for history', `\u21C5`);
		const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS = nls.localize({
			key: 'history.inputbox.hint.suffix.inparens',
			comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field does NOT end in a closing parenthesis (eg. "Find"). The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
		}, ' ({0} for history)', `\u21C5`);

		super(container, contextViewProvider, options);
		this.history = new HistoryNavigator<string>(options.history, 100);

		// Function to append the history suffix to the placeholder if necessary
		const addSuffix = () => {
			if (options.showHistoryHint && options.showHistoryHint() && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS) && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS) && this.history.getHistory().length) {
				const suffix = this.placeholder.endsWith(')') ? NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS : NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS;
				const suffixedPlaceholder = this.placeholder + suffix;
				if (options.showPlaceholderOnFocus && !dom.isActiveElement(this.input)) {
					this.placeholder = suffixedPlaceholder;
				}
				else {
					this.setPlaceHolder(suffixedPlaceholder);
				}
			}
		};

		// Spot the change to the textarea class attribute which occurs when it changes between non-empty and empty,
		// and add the history suffix to the placeholder if not yet present
		this.observer = new MutationObserver((mutationList: MutationRecord[], observer: MutationObserver) => {
			mutationList.forEach((mutation: MutationRecord) => {
				if (!mutation.target.textContent) {
					addSuffix();
				}
			});
		});
		this.observer.observe(this.input, { attributeFilter: ['class'] });

		this.onfocus(this.input, () => addSuffix());
		this.onblur(this.input, () => {
			const resetPlaceholder = (historyHint: string) => {
				if (!this.placeholder.endsWith(historyHint)) {
					return false;
				}
				else {
					const revertedPlaceholder = this.placeholder.slice(0, this.placeholder.length - historyHint.length);
					if (options.showPlaceholderOnFocus) {
						this.placeholder = revertedPlaceholder;
					}
					else {
						this.setPlaceHolder(revertedPlaceholder);
					}
					return true;
				}
			};
			if (!resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS)) {
				resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS);
			}
		});
	}

	override dispose() {
		super.dispose();
		if (this.observer) {
			this.observer.disconnect();
			this.observer = undefined;
		}
	}

	public addToHistory(always?: boolean): void {
		if (this.value && (always || this.value !== this.getCurrentValue())) {
			this.history.add(this.value);
		}
	}

	public prependHistory(restoredHistory: string[]): void {
		const newHistory = this.getHistory();
		this.clearHistory();

		restoredHistory.forEach((item) => {
			this.history.add(item);
		});

		newHistory.forEach(item => {
			this.history.add(item);
		});
	}

	public getHistory(): string[] {
		return this.history.getHistory();
	}

	public isAtFirstInHistory(): boolean {
		return this.history.isFirst();
	}

	public isAtLastInHistory(): boolean {
		return this.history.isLast();
	}

	public isNowhereInHistory(): boolean {
		return this.history.isNowhere();
	}

	public showNextValue(): void {
		if (!this.history.has(this.value)) {
			this.addToHistory();
		}

		let next = this.getNextValue();
		if (next) {
			next = next === this.value ? this.getNextValue() : next;
		}

		this.value = next ?? '';
		aria.status(this.value ? this.value : nls.localize('clearedInput', "Cleared Input"));
	}

	public showPreviousValue(): void {
		if (!this.history.has(this.value)) {
			this.addToHistory();
		}

		let previous = this.getPreviousValue();
		if (previous) {
			previous = previous === this.value ? this.getPreviousValue() : previous;
		}

		if (previous) {
			this.value = previous;
			aria.status(this.value);
		}
	}

	public clearHistory(): void {
		this.history.clear();
	}

	public override setPlaceHolder(placeHolder: string): void {
		super.setPlaceHolder(placeHolder);
		this.setTooltip(placeHolder);
	}

	protected override onBlur(): void {
		super.onBlur();
		this._onDidBlur.fire();
	}

	protected override onFocus(): void {
		super.onFocus();
		this._onDidFocus.fire();
	}

	private getCurrentValue(): string | null {
		let currentValue = this.history.current();
		if (!currentValue) {
			currentValue = this.history.last();
			this.history.next();
		}
		return currentValue;
	}

	private getPreviousValue(): string | null {
		return this.history.previous() || this.history.first();
	}

	private getNextValue(): string | null {
		return this.history.next();
	}
}
