/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { SimpleFindWidget } from '../../../codeEditor/browser/find/simpleFindWidget.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService, IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDetachedTerminalInstance, ITerminalInstance, IXtermTerminal, XtermTerminalConstants } from '../../../terminal/browser/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { Event } from '../../../../../base/common/event.js';
import type { ISearchOptions } from '@xterm/addon-search';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { openContextMenu } from './textInputContextMenu.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { TerminalFindCommandId } from '../common/terminal.find.js';

const TERMINAL_FIND_WIDGET_INITIAL_WIDTH = 419;

export class TerminalFindWidget extends SimpleFindWidget {
	private _findInputFocused: IContextKey<boolean>;
	private _findWidgetFocused: IContextKey<boolean>;
	private _findWidgetVisible: IContextKey<boolean>;

	private _overrideCopyOnSelectionDisposable: IDisposable | undefined;

	constructor(
		private _instance: ITerminalInstance | IDetachedTerminalInstance,
		@IContextViewService _contextViewService: IContextViewService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextMenuService _contextMenuService: IContextMenuService,
		@IClipboardService _clipboardService: IClipboardService,
		@IHoverService hoverService: IHoverService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super({
			showCommonFindToggles: true,
			checkImeCompletionState: true,
			showResultCount: true,
			initialWidth: TERMINAL_FIND_WIDGET_INITIAL_WIDTH,
			enableSash: true,
			appendCaseSensitiveActionId: TerminalFindCommandId.ToggleFindCaseSensitive,
			appendRegexActionId: TerminalFindCommandId.ToggleFindRegex,
			appendWholeWordsActionId: TerminalFindCommandId.ToggleFindWholeWord,
			previousMatchActionId: TerminalFindCommandId.FindPrevious,
			nextMatchActionId: TerminalFindCommandId.FindNext,
			closeWidgetActionId: TerminalFindCommandId.FindHide,
			type: 'Terminal',
			matchesLimit: XtermTerminalConstants.SearchHighlightLimit
		}, _contextViewService, _contextKeyService, hoverService, keybindingService);

		this._register(this.state.onFindReplaceStateChange(() => {
			this.show();
		}));
		this._findInputFocused = TerminalContextKeys.findInputFocus.bindTo(this._contextKeyService);
		this._findWidgetFocused = TerminalContextKeys.findFocus.bindTo(this._contextKeyService);
		this._findWidgetVisible = TerminalContextKeys.findVisible.bindTo(this._contextKeyService);
		const innerDom = this.getDomNode().firstChild;
		if (innerDom) {
			this._register(dom.addDisposableListener(innerDom, 'mousedown', (event) => {
				event.stopPropagation();
			}));
			this._register(dom.addDisposableListener(innerDom, 'contextmenu', (event) => {
				event.stopPropagation();
			}));
		}
		const findInputDomNode = this.getFindInputDomNode();
		this._register(dom.addDisposableListener(findInputDomNode, 'contextmenu', (event) => {
			openContextMenu(dom.getWindow(findInputDomNode), event, _clipboardService, _contextMenuService);
			event.stopPropagation();
		}));
		this._register(this._themeService.onDidColorThemeChange(() => {
			if (this.isVisible()) {
				this.find(true, true);
			}
		}));
		this._register(this._configurationService.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('workbench.colorCustomizations') && this.isVisible()) {
				this.find(true, true);
			}
		}));

		this.updateResultCount();
	}

	find(previous: boolean, update?: boolean) {
		const xterm = this._instance.xterm;
		if (!xterm) {
			return;
		}
		if (previous) {
			this._findPreviousWithEvent(xterm, this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue(), incremental: update });
		} else {
			this._findNextWithEvent(xterm, this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() });
		}
	}

	override reveal(): void {
		const initialInput = this._instance.hasSelection() && !this._instance.selection!.includes('\n') ? this._instance.selection : undefined;
		const inputValue = initialInput ?? this.inputValue;
		const xterm = this._instance.xterm;
		if (xterm && inputValue && inputValue !== '') {
			// trigger highlight all matches
			this._findPreviousWithEvent(xterm, inputValue, { incremental: true, regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() }).then(foundMatch => {
				this.updateButtons(foundMatch);
				this._register(Event.once(xterm.onDidChangeSelection)(() => xterm.clearActiveSearchDecoration()));
			});
		}
		this.updateButtons(false);

		super.reveal(inputValue);
		this._findWidgetVisible.set(true);
	}

	override show() {
		const initialInput = this._instance.hasSelection() && !this._instance.selection!.includes('\n') ? this._instance.selection : undefined;
		super.show(initialInput);
		this._findWidgetVisible.set(true);
	}

	override hide() {
		super.hide();
		this._findWidgetVisible.reset();
		this._instance.focus(true);
		this._instance.xterm?.clearSearchDecorations();
	}

	protected async _getResultCount(): Promise<{ resultIndex: number; resultCount: number } | undefined> {
		return this._instance.xterm?.findResult;
	}

	protected _onInputChanged() {
		// Ignore input changes for now
		const xterm = this._instance.xterm;
		if (xterm) {
			this._findPreviousWithEvent(xterm, this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue(), incremental: true }).then(foundMatch => {
				this.updateButtons(foundMatch);
			});
		}
		return false;
	}

	protected _onFocusTrackerFocus() {
		if ('overrideCopyOnSelection' in this._instance) {
			this._overrideCopyOnSelectionDisposable = this._instance.overrideCopyOnSelection(false);
		}
		this._findWidgetFocused.set(true);
	}

	protected _onFocusTrackerBlur() {
		this._overrideCopyOnSelectionDisposable?.dispose();
		this._instance.xterm?.clearActiveSearchDecoration();
		this._findWidgetFocused.reset();
	}

	protected _onFindInputFocusTrackerFocus() {
		this._findInputFocused.set(true);
	}

	protected _onFindInputFocusTrackerBlur() {
		this._findInputFocused.reset();
	}

	findFirst() {
		const instance = this._instance;
		if (instance.hasSelection()) {
			instance.clearSelection();
		}
		const xterm = instance.xterm;
		if (xterm) {
			this._findPreviousWithEvent(xterm, this.inputValue, { regex: this._getRegexValue(), wholeWord: this._getWholeWordValue(), caseSensitive: this._getCaseSensitiveValue() });
		}
	}

	private async _findNextWithEvent(xterm: IXtermTerminal, term: string, options: ISearchOptions): Promise<boolean> {
		return xterm.findNext(term, options).then(foundMatch => {
			this._register(Event.once(xterm.onDidChangeSelection)(() => xterm.clearActiveSearchDecoration()));
			return foundMatch;
		});
	}

	private async _findPreviousWithEvent(xterm: IXtermTerminal, term: string, options: ISearchOptions): Promise<boolean> {
		return xterm.findPrevious(term, options).then(foundMatch => {
			this._register(Event.once(xterm.onDidChangeSelection)(() => xterm.clearActiveSearchDecoration()));
			return foundMatch;
		});
	}
}
