/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./simpleFindWidget';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { KeyCode } from 'vs/base/common/keyCodes';
import { FindReplaceState, INewFindReplaceState } from 'vs/editor/contrib/find/browser/findState';
import { IMessage as InputBoxMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { SimpleButton, findPreviousMatchIcon, findNextMatchIcon, NLS_NO_RESULTS, NLS_MATCHES_LOCATION } from 'vs/editor/contrib/find/browser/findWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { ContextScopedFindInput } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { widgetClose } from 'vs/platform/theme/common/iconRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import * as strings from 'vs/base/common/strings';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { status } from 'vs/base/browser/ui/aria/aria';
import { defaultInputBoxStyles, defaultToggleStyles } from 'vs/platform/theme/browser/defaultStyles';
import { ISashEvent, IVerticalSashLayoutProvider, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { registerColor } from 'vs/platform/theme/common/colorRegistry';
import type { IHoverService } from 'vs/platform/hover/browser/hover';

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next Match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");

interface IFindOptions {
	showCommonFindToggles?: boolean;
	checkImeCompletionState?: boolean;
	showResultCount?: boolean;
	appendCaseSensitiveActionId?: string;
	appendRegexActionId?: string;
	appendWholeWordsActionId?: string;
	previousMatchActionId?: string;
	nextMatchActionId?: string;
	closeWidgetActionId?: string;
	matchesLimit?: number;
	type?: 'Terminal' | 'Webview';
	initialWidth?: number;
	enableSash?: boolean;
}

const SIMPLE_FIND_WIDGET_INITIAL_WIDTH = 310;
const MATCHES_COUNT_WIDTH = 73;

export abstract class SimpleFindWidget extends Widget implements IVerticalSashLayoutProvider {
	private readonly _findInput: FindInput;
	private readonly _domNode: HTMLElement;
	private readonly _innerDomNode: HTMLElement;
	private readonly _focusTracker: dom.IFocusTracker;
	private readonly _findInputFocusTracker: dom.IFocusTracker;
	private readonly _updateHistoryDelayer: Delayer<void>;
	private readonly prevBtn: SimpleButton;
	private readonly nextBtn: SimpleButton;
	private readonly _matchesLimit: number;
	private _matchesCount: HTMLElement | undefined;

	private _isVisible: boolean = false;
	private _foundMatch: boolean = false;
	private _width: number = 0;

	readonly state: FindReplaceState = new FindReplaceState();

	constructor(
		options: IFindOptions,
		contextViewService: IContextViewService,
		contextKeyService: IContextKeyService,
		hoverService: IHoverService,
		private readonly _keybindingService: IKeybindingService,
	) {
		super();

		this._matchesLimit = options.matchesLimit ?? Number.MAX_SAFE_INTEGER;

		this._findInput = this._register(new ContextScopedFindInput(null, contextViewService, {
			label: NLS_FIND_INPUT_LABEL,
			placeholder: NLS_FIND_INPUT_PLACEHOLDER,
			validation: (value: string): InputBoxMessage | null => {
				if (value.length === 0 || !this._findInput.getRegex()) {
					return null;
				}
				try {
					new RegExp(value);
					return null;
				} catch (e) {
					this._foundMatch = false;
					this.updateButtons(this._foundMatch);
					return { content: e.message };
				}
			},
			showCommonFindToggles: options.showCommonFindToggles,
			appendCaseSensitiveLabel: options.appendCaseSensitiveActionId ? this._getKeybinding(options.appendCaseSensitiveActionId) : undefined,
			appendRegexLabel: options.appendRegexActionId ? this._getKeybinding(options.appendRegexActionId) : undefined,
			appendWholeWordsLabel: options.appendWholeWordsActionId ? this._getKeybinding(options.appendWholeWordsActionId) : undefined,
			showHistoryHint: () => showHistoryKeybindingHint(_keybindingService),
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles
		}, contextKeyService));
		// Find History with update delayer
		this._updateHistoryDelayer = this._register(new Delayer<void>(500));

		this._register(this._findInput.onInput(async (e) => {
			if (!options.checkImeCompletionState || !this._findInput.isImeSessionInProgress) {
				this._foundMatch = this._onInputChanged();
				if (options.showResultCount) {
					await this.updateResultCount();
				}
				this.updateButtons(this._foundMatch);
				this.focusFindBox();
				this._delayedUpdateHistory();
			}
		}));

		this._findInput.setRegex(!!this.state.isRegex);
		this._findInput.setCaseSensitive(!!this.state.matchCase);
		this._findInput.setWholeWords(!!this.state.wholeWord);

		this._register(this._findInput.onDidOptionChange(() => {
			this.state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));

		this._register(this.state.onFindReplaceStateChange(() => {
			this._findInput.setRegex(this.state.isRegex);
			this._findInput.setWholeWords(this.state.wholeWord);
			this._findInput.setCaseSensitive(this.state.matchCase);
			this.findFirst();
		}));

		this.prevBtn = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL + (options.previousMatchActionId ? this._getKeybinding(options.previousMatchActionId) : ''),
			icon: findPreviousMatchIcon,
			onTrigger: () => {
				this.find(true);
			}
		}, hoverService));

		this.nextBtn = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL + (options.nextMatchActionId ? this._getKeybinding(options.nextMatchActionId) : ''),
			icon: findNextMatchIcon,
			onTrigger: () => {
				this.find(false);
			}
		}, hoverService));

		const closeBtn = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL + (options.closeWidgetActionId ? this._getKeybinding(options.closeWidgetActionId) : ''),
			icon: widgetClose,
			onTrigger: () => {
				this.hide();
			}
		}, hoverService));

		this._innerDomNode = document.createElement('div');
		this._innerDomNode.classList.add('simple-find-part');
		this._innerDomNode.appendChild(this._findInput.domNode);
		this._innerDomNode.appendChild(this.prevBtn.domNode);
		this._innerDomNode.appendChild(this.nextBtn.domNode);
		this._innerDomNode.appendChild(closeBtn.domNode);

		// _domNode wraps _innerDomNode, ensuring that
		this._domNode = document.createElement('div');
		this._domNode.classList.add('simple-find-part-wrapper');
		this._domNode.appendChild(this._innerDomNode);

		this.onkeyup(this._innerDomNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});

		this._focusTracker = this._register(dom.trackFocus(this._innerDomNode));
		this._register(this._focusTracker.onDidFocus(this._onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this._onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.onDidFocus(this._onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.onDidBlur(this._onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._innerDomNode, 'click', (event) => {
			event.stopPropagation();
		}));

		if (options?.showResultCount) {
			this._domNode.classList.add('result-count');
			this._matchesCount = document.createElement('div');
			this._matchesCount.className = 'matchesCount';
			this._findInput.domNode.insertAdjacentElement('afterend', this._matchesCount);
			this._register(this._findInput.onDidChange(async () => {
				await this.updateResultCount();
			}));
			this._register(this._findInput.onDidOptionChange(async () => {
				this._foundMatch = this._onInputChanged();
				await this.updateResultCount();
				this.focusFindBox();
				this._delayedUpdateHistory();
			}));
		}

		let initialMinWidth = options?.initialWidth;
		if (initialMinWidth) {
			initialMinWidth = initialMinWidth < SIMPLE_FIND_WIDGET_INITIAL_WIDTH ? SIMPLE_FIND_WIDGET_INITIAL_WIDTH : initialMinWidth;
			this._domNode.style.width = `${initialMinWidth}px`;
		}

		if (options?.enableSash) {
			const _initialMinWidth = initialMinWidth ?? SIMPLE_FIND_WIDGET_INITIAL_WIDTH;
			let originalWidth = _initialMinWidth;

			// sash
			const resizeSash = this._register(new Sash(this._innerDomNode, this, { orientation: Orientation.VERTICAL, size: 1 }));
			this._register(resizeSash.onDidStart(() => {
				originalWidth = parseFloat(dom.getComputedStyle(this._domNode).width);
			}));

			this._register(resizeSash.onDidChange((e: ISashEvent) => {
				const width = originalWidth + e.startX - e.currentX;
				if (width < _initialMinWidth) {
					return;
				}
				this._domNode.style.width = `${width}px`;
			}));

			this._register(resizeSash.onDidReset(e => {
				const currentWidth = parseFloat(dom.getComputedStyle(this._domNode).width);
				if (currentWidth === _initialMinWidth) {
					this._domNode.style.width = '100%';
				} else {
					this._domNode.style.width = `${_initialMinWidth}px`;
				}
			}));
		}
	}

	public getVerticalSashLeft(_sash: Sash): number {
		return 0;
	}

	public abstract find(previous: boolean): void;
	public abstract findFirst(): void;
	protected abstract _onInputChanged(): boolean;
	protected abstract _onFocusTrackerFocus(): void;
	protected abstract _onFocusTrackerBlur(): void;
	protected abstract _onFindInputFocusTrackerFocus(): void;
	protected abstract _onFindInputFocusTrackerBlur(): void;
	protected abstract _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined>;

	protected get inputValue() {
		return this._findInput.getValue();
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	private _getKeybinding(actionId: string): string {
		const kb = this._keybindingService?.lookupKeybinding(actionId);
		if (!kb) {
			return '';
		}
		return ` (${kb.getLabel()})`;
	}

	override dispose() {
		super.dispose();

		this._domNode?.remove();
	}

	public isVisible(): boolean {
		return this._isVisible;
	}

	public getDomNode() {
		return this._domNode;
	}

	public getFindInputDomNode() {
		return this._findInput.domNode;
	}

	public reveal(initialInput?: string, animated = true): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (this._isVisible) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;
		this.updateResultCount();
		this.layout();

		setTimeout(() => {
			this._innerDomNode.classList.toggle('suppress-transition', !animated);
			this._innerDomNode.classList.add('visible', 'visible-transition');
			this._innerDomNode.setAttribute('aria-hidden', 'false');
			this._findInput.select();

			if (!animated) {
				setTimeout(() => {
					this._innerDomNode.classList.remove('suppress-transition');
				}, 0);
			}
		}, 0);
	}

	public show(initialInput?: string): void {
		if (initialInput && !this._isVisible) {
			this._findInput.setValue(initialInput);
		}

		this._isVisible = true;
		this.layout();

		setTimeout(() => {
			this._innerDomNode.classList.add('visible', 'visible-transition');

			this._innerDomNode.setAttribute('aria-hidden', 'false');
		}, 0);
	}

	public hide(animated = true): void {
		if (this._isVisible) {
			this._innerDomNode.classList.toggle('suppress-transition', !animated);
			this._innerDomNode.classList.remove('visible-transition');
			this._innerDomNode.setAttribute('aria-hidden', 'true');
			// Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
			setTimeout(() => {
				this._isVisible = false;
				this.updateButtons(this._foundMatch);
				this._innerDomNode.classList.remove('visible', 'suppress-transition');
			}, animated ? 200 : 0);
		}
	}

	public layout(width: number = this._width): void {
		this._width = width;

		if (!this._isVisible) {
			return;
		}

		if (this._matchesCount) {
			let reducedFindWidget = false;
			if (SIMPLE_FIND_WIDGET_INITIAL_WIDTH + MATCHES_COUNT_WIDTH + 28 >= width) {
				reducedFindWidget = true;
			}
			this._innerDomNode.classList.toggle('reduced-find-widget', reducedFindWidget);
		}
	}

	protected _delayedUpdateHistory() {
		this._updateHistoryDelayer.trigger(this._updateHistory.bind(this));
	}

	protected _updateHistory() {
		this._findInput.inputBox.addToHistory();
	}

	protected _getRegexValue(): boolean {
		return this._findInput.getRegex();
	}

	protected _getWholeWordValue(): boolean {
		return this._findInput.getWholeWords();
	}

	protected _getCaseSensitiveValue(): boolean {
		return this._findInput.getCaseSensitive();
	}

	protected updateButtons(foundMatch: boolean) {
		const hasInput = this.inputValue.length > 0;
		this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
		this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
	}

	protected focusFindBox() {
		// Focus back onto the find box, which
		// requires focusing onto the next button first
		this.nextBtn.focus();
		this._findInput.inputBox.focus();
	}

	async updateResultCount(): Promise<void> {
		if (!this._matchesCount) {
			this.updateButtons(this._foundMatch);
			return;
		}

		const count = await this._getResultCount();
		this._matchesCount.innerText = '';
		const showRedOutline = (this.inputValue.length > 0 && count?.resultCount === 0);
		this._matchesCount.classList.toggle('no-results', showRedOutline);
		let label = '';
		if (count?.resultCount) {
			let matchesCount: string = String(count.resultCount);
			if (count.resultCount >= this._matchesLimit) {
				matchesCount += '+';
			}
			let matchesPosition: string = String(count.resultIndex + 1);
			if (matchesPosition === '0') {
				matchesPosition = '?';
			}
			label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
		} else {
			label = NLS_NO_RESULTS;
		}
		status(this._announceSearchResults(label, this.inputValue));
		this._matchesCount.appendChild(document.createTextNode(label));
		this._foundMatch = !!count && count.resultCount > 0;
		this.updateButtons(this._foundMatch);
	}

	changeState(state: INewFindReplaceState) {
		this.state.change(state, false);
	}

	private _announceSearchResults(label: string, searchString?: string): string {
		if (!searchString) {
			return nls.localize('ariaSearchNoInput', "Enter search input");
		}
		if (label === NLS_NO_RESULTS) {
			return searchString === ''
				? nls.localize('ariaSearchNoResultEmpty', "{0} found", label)
				: nls.localize('ariaSearchNoResult', "{0} found for '{1}'", label, searchString);
		}

		return nls.localize('ariaSearchNoResultWithLineNumNoCurrentMatch', "{0} found for '{1}'", label, searchString);
	}
}

export const simpleFindWidgetSashBorder = registerColor('simpleFindWidget.sashBorder', { dark: '#454545', light: '#C8C8C8', hcDark: '#6FC3DF', hcLight: '#0F4A85' }, nls.localize('simpleFindWidget.sashBorder', 'Border color of the sash border.'));

registerThemingParticipant((theme, collector) => {
	const resizeBorderBackground = theme.getColor(simpleFindWidgetSashBorder);
	collector.addRule(`.monaco-workbench .simple-find-part .monaco-sash { background-color: ${resizeBorderBackground}; border-color: ${resizeBorderBackground} }`);
});
