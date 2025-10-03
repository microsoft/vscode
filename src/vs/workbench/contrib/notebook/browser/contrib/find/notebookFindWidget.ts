/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../../../base/browser/keyboardEvent.js';
import { alert as alertFn } from '../../../../../../base/browser/ui/aria/aria.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Lazy } from '../../../../../../base/common/lazy.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import * as strings from '../../../../../../base/common/strings.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { FindMatch } from '../../../../../../editor/common/model.js';
import { MATCHES_LIMIT } from '../../../../../../editor/contrib/find/browser/findModel.js';
import { FindReplaceState } from '../../../../../../editor/contrib/find/browser/findState.js';
import { NLS_MATCHES_LOCATION, NLS_NO_RESULTS } from '../../../../../../editor/contrib/find/browser/findWidget.js';
import { FindWidgetSearchHistory } from '../../../../../../editor/contrib/find/browser/findWidgetSearchHistory.js';
import { ReplaceWidgetHistory } from '../../../../../../editor/contrib/find/browser/replaceWidgetHistory.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { NotebookFindFilters } from './findFilters.js';
import { FindModel } from './findModel.js';
import { SimpleFindReplaceWidget } from './notebookFindReplaceWidget.js';
import { CellEditState, ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { INotebookFindScope } from '../../../common/notebookCommon.js';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED } from '../../../common/notebookContextKeys.js';

const FIND_HIDE_TRANSITION = 'find-hide-transition';
const FIND_SHOW_TRANSITION = 'find-show-transition';
let MAX_MATCHES_COUNT_WIDTH = 69;
const PROGRESS_BAR_DELAY = 200; // show progress for at least 200ms

export interface IShowNotebookFindWidgetOptions {
	isRegex?: boolean;
	wholeWord?: boolean;
	matchCase?: boolean;
	matchIndex?: number;
	focus?: boolean;
	searchStringSeededFrom?: { cell: ICellViewModel; range: Range };
	findScope?: INotebookFindScope;
}

export class NotebookFindContrib extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'workbench.notebook.find';

	private readonly _widget: Lazy<NotebookFindWidget>;

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();

		this._widget = new Lazy(() => this._register(this.instantiationService.createInstance(NotebookFindWidget, this.notebookEditor)));
	}

	get widget(): NotebookFindWidget {
		return this._widget.value;
	}

	show(initialInput?: string, options?: IShowNotebookFindWidgetOptions): Promise<void> {
		return this._widget.value.show(initialInput, options);
	}

	hide() {
		this._widget.rawValue?.hide();
	}

	replace(searchString: string | undefined) {
		return this._widget.value.replace(searchString);
	}
}

class NotebookFindWidget extends SimpleFindReplaceWidget implements INotebookEditorContribution {
	protected _findWidgetFocused: IContextKey<boolean>;
	private _isFocused: boolean = false;
	private _showTimeout: number | null = null;
	private _hideTimeout: number | null = null;
	private _previousFocusElement?: HTMLElement;
	private _findModel: FindModel;

	constructor(
		_notebookEditor: INotebookEditor,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
	) {
		const findSearchHistory = FindWidgetSearchHistory.getOrCreate(storageService);
		const replaceHistory = ReplaceWidgetHistory.getOrCreate(storageService);

		super(contextViewService, contextKeyService, configurationService, contextMenuService, instantiationService, hoverService, new FindReplaceState<NotebookFindFilters>(), _notebookEditor, findSearchHistory, replaceHistory);
		this._findModel = new FindModel(this._notebookEditor, this._state, this._configurationService);

		DOM.append(this._notebookEditor.getDomNode(), this.getDomNode());
		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
		this._register(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
		this._register(this._replaceInput.onKeyDown((e) => this._onReplaceInputKeyDown(e)));

		this._register(this._state.onFindReplaceStateChange((e) => {
			this.onInputChanged();

			if (e.isSearching) {
				if (this._state.isSearching) {
					this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
				} else {
					this._progressBar.stop().hide();
				}
			}

			if (this._findModel.currentMatch >= 0) {
				const currentMatch = this._findModel.getCurrentMatch();
				this._replaceBtn.setEnabled(currentMatch.isModelMatch);
			}

			const matches = this._findModel.findMatches;
			this._replaceAllBtn.setEnabled(matches.length > 0 && matches.find(match => match.webviewMatches.length > 0) === undefined);

			if (e.filters) {
				this._findInput.updateFilterState(this._state.filters?.isModified() ?? false);
			}
		}));

		this._register(DOM.addDisposableListener(this.getDomNode(), DOM.EventType.FOCUS, e => {
			this._previousFocusElement = DOM.isHTMLElement(e.relatedTarget) ? e.relatedTarget : undefined;
		}, true));
	}

	get findModel(): FindModel {
		return this._findModel;
	}

	get isFocused(): boolean {
		return this._isFocused;
	}

	private _onFindInputKeyDown(e: IKeyboardEvent): void {
		if (e.equals(KeyCode.Enter)) {
			this.find(false);
			e.preventDefault();
			return;
		} else if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
			this.find(true);
			e.preventDefault();
			return;
		}
	}

	private _onReplaceInputKeyDown(e: IKeyboardEvent): void {
		if (e.equals(KeyCode.Enter)) {
			this.replaceOne();
			e.preventDefault();
			return;
		}
	}

	protected onInputChanged(): boolean {
		this._state.change({ searchString: this.inputValue }, false);
		// this._findModel.research();
		const findMatches = this._findModel.findMatches;
		if (findMatches && findMatches.length) {
			return true;
		}

		return false;
	}

	private findIndex(index: number): void {
		this._findModel.find({ index });
	}

	protected find(previous: boolean): void {
		this._findModel.find({ previous });
	}

	protected replaceOne() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		if (!this._findModel.findMatches.length) {
			return;
		}

		this._findModel.ensureFindMatches();

		if (this._findModel.currentMatch < 0) {
			this._findModel.find({ previous: false });
		}

		const currentMatch = this._findModel.getCurrentMatch();
		const cell = currentMatch.cell;
		if (currentMatch.isModelMatch) {
			const match = currentMatch.match as FindMatch;

			this._progressBar.infinite().show(PROGRESS_BAR_DELAY);

			const replacePattern = this.replacePattern;
			const replaceString = replacePattern.buildReplaceString(match.matches, this._state.preserveCase);

			const viewModel = this._notebookEditor.getViewModel();
			viewModel.replaceOne(cell, match.range, replaceString).then(() => {
				this._progressBar.stop();
			});
		} else {
			// this should not work
			console.error('Replace does not work for output match');
		}
	}

	protected replaceAll() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		this._progressBar.infinite().show(PROGRESS_BAR_DELAY);

		const replacePattern = this.replacePattern;

		const cellFindMatches = this._findModel.findMatches;
		const replaceStrings: string[] = [];
		cellFindMatches.forEach(cellFindMatch => {
			cellFindMatch.contentMatches.forEach(match => {
				const matches = match.matches;
				replaceStrings.push(replacePattern.buildReplaceString(matches, this._state.preserveCase));
			});
		});

		const viewModel = this._notebookEditor.getViewModel();
		viewModel.replaceAll(this._findModel.findMatches, replaceStrings).then(() => {
			this._progressBar.stop();
		});
	}

	protected findFirst(): void { }

	protected onFocusTrackerFocus() {
		this._findWidgetFocused.set(true);
		this._isFocused = true;
	}

	protected onFocusTrackerBlur() {
		this._previousFocusElement = undefined;
		this._findWidgetFocused.reset();
		this._isFocused = false;
	}

	protected onReplaceInputFocusTrackerFocus(): void {
		// throw new Error('Method not implemented.');
	}
	protected onReplaceInputFocusTrackerBlur(): void {
		// throw new Error('Method not implemented.');
	}

	protected onFindInputFocusTrackerFocus(): void { }
	protected onFindInputFocusTrackerBlur(): void { }

	override async show(initialInput?: string, options?: IShowNotebookFindWidgetOptions): Promise<void> {
		const searchStringUpdate = this._state.searchString !== initialInput;
		super.show(initialInput, options);
		this._state.change({ searchString: initialInput ?? this._state.searchString, isRevealed: true }, false);

		if (typeof options?.matchIndex === 'number') {
			if (!this._findModel.findMatches.length) {
				await this._findModel.research();
			}
			this.findIndex(options.matchIndex);
		} else {
			this._findInput.select();
		}

		if (!searchStringUpdate && options?.searchStringSeededFrom) {
			this._findModel.refreshCurrentMatch(options.searchStringSeededFrom);
		}

		if (this._showTimeout === null) {
			if (this._hideTimeout !== null) {
				DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
				this._hideTimeout = null;
				this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
			}

			this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
			this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
				this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
				this._showTimeout = null;
			}, 200);
		} else {
			// no op
		}
	}

	replace(initialFindInput?: string, initialReplaceInput?: string) {
		super.showWithReplace(initialFindInput, initialReplaceInput);
		this._state.change({ searchString: initialFindInput ?? '', replaceString: initialReplaceInput ?? '', isRevealed: true }, false);
		this._replaceInput.select();

		if (this._showTimeout === null) {
			if (this._hideTimeout !== null) {
				DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
				this._hideTimeout = null;
				this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
			}

			this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
			this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
				this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
				this._showTimeout = null;
			}, 200);
		} else {
			// no op
		}
	}

	override hide() {
		super.hide();
		this._state.change({ isRevealed: false }, false);
		this._findModel.clear();
		this._notebookEditor.findStop();
		this._progressBar.stop();

		if (this._hideTimeout === null) {
			if (this._showTimeout !== null) {
				DOM.getWindow(this.getDomNode()).clearTimeout(this._showTimeout);
				this._showTimeout = null;
				this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
			}
			this._notebookEditor.addClassName(FIND_HIDE_TRANSITION);
			this._hideTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
				this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
			}, 200);
		} else {
			// no op
		}

		if (this._previousFocusElement && this._previousFocusElement.offsetParent) {
			this._previousFocusElement.focus();
			this._previousFocusElement = undefined;
		}

		if (this._notebookEditor.hasModel()) {
			for (let i = 0; i < this._notebookEditor.getLength(); i++) {
				const cell = this._notebookEditor.cellAt(i);

				if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === 'find') {
					cell.updateEditState(CellEditState.Preview, 'closeFind');
				}
			}
		}
	}

	protected override _updateMatchesCount(): void {
		if (!this._findModel || !this._findModel.findMatches) {
			return;
		}

		this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + 'px';
		this._matchesCount.title = '';

		// remove previous content
		this._matchesCount.firstChild?.remove();

		let label: string;

		if (this._state.matchesCount > 0) {
			let matchesCount: string = String(this._state.matchesCount);
			if (this._state.matchesCount >= MATCHES_LIMIT) {
				matchesCount += '+';
			}
			const matchesPosition: string = this._findModel.currentMatch < 0 ? '?' : String((this._findModel.currentMatch + 1));
			label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
		} else {
			label = NLS_NO_RESULTS;
		}

		this._matchesCount.appendChild(document.createTextNode(label));

		alertFn(this._getAriaLabel(label, this._state.currentMatch, this._state.searchString));
		MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
	}

	private _getAriaLabel(label: string, currentMatch: Range | null, searchString: string): string {
		if (label === NLS_NO_RESULTS) {
			return searchString === ''
				? localize('ariaSearchNoResultEmpty', "{0} found", label)
				: localize('ariaSearchNoResult', "{0} found for '{1}'", label, searchString);
		}

		// TODO@rebornix, aria for `cell ${index}, line {line}`
		return localize('ariaSearchNoResultWithLineNumNoCurrentMatch', "{0} found for '{1}'", label, searchString);
	}
	override dispose() {
		this._notebookEditor?.removeClassName(FIND_SHOW_TRANSITION);
		this._notebookEditor?.removeClassName(FIND_HIDE_TRANSITION);
		this._findModel.dispose();
		super.dispose();
	}
}
