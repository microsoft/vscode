/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../../../nls.js';
import * as dom from '../../../../../../base/browser/dom.js';
import './notebookFindReplaceWidget.css';
import { ActionBar } from '../../../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { AnchorAlignment, IContextViewProvider } from '../../../../../../base/browser/ui/contextview/contextview.js';
import { DropdownMenuActionViewItem } from '../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { FindInput, IFindInputOptions } from '../../../../../../base/browser/ui/findinput/findInput.js';
import { ReplaceInput } from '../../../../../../base/browser/ui/findinput/replaceInput.js';
import { IMessage as InputBoxMessage } from '../../../../../../base/browser/ui/inputbox/inputBox.js';
import { ProgressBar } from '../../../../../../base/browser/ui/progressbar/progressbar.js';
import { ISashEvent, Orientation, Sash } from '../../../../../../base/browser/ui/sash/sash.js';
import { IToggleStyles, Toggle } from '../../../../../../base/browser/ui/toggle/toggle.js';
import { Widget } from '../../../../../../base/browser/ui/widget.js';
import { Action, ActionRunner, IAction, IActionRunner, Separator } from '../../../../../../base/common/actions.js';
import { Delayer } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { isSafari } from '../../../../../../base/common/platform.js';
import { IHistory } from '../../../../../../base/common/history.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { FindReplaceState, FindReplaceStateChangedEvent } from '../../../../../../editor/contrib/find/browser/findState.js';
import { findNextMatchIcon, findPreviousMatchIcon, findReplaceAllIcon, findReplaceIcon, findSelectionIcon, SimpleButton } from '../../../../../../editor/contrib/find/browser/findWidget.js';
import { parseReplaceString, ReplacePattern } from '../../../../../../editor/contrib/find/browser/replacePattern.js';
import { getActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenu } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService, IContextViewService } from '../../../../../../platform/contextview/browser/contextView.js';
import { ContextScopedReplaceInput, registerAndCreateHistoryNavigationContext } from '../../../../../../platform/history/browser/contextScopedHistoryWidget.js';

import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { defaultInputBoxStyles, defaultProgressBarStyles, defaultToggleStyles } from '../../../../../../platform/theme/browser/defaultStyles.js';
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from '../../../../../../platform/theme/common/colorRegistry.js';
import { registerIcon, widgetClose } from '../../../../../../platform/theme/common/iconRegistry.js';
import { registerThemingParticipant } from '../../../../../../platform/theme/common/themeService.js';
import { filterIcon } from '../../../../extensions/browser/extensionsIcons.js';
import { NotebookFindFilters } from './findFilters.js';
import { IShowNotebookFindWidgetOptions } from './notebookFindWidget.js';
import { ICellModelDecorations, ICellModelDeltaDecorations, ICellViewModel, INotebookDeltaDecoration, INotebookEditor } from '../../notebookBrowser.js';
import { NotebookFindScopeType, NotebookSetting } from '../../../common/notebookCommon.js';
import { ICellRange } from '../../../common/notebookRange.js';


const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize('label.toggleSelectionFind', "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize('label.toggleReplaceButton', "Toggle Replace");
const NLS_REPLACE_INPUT_LABEL = nls.localize('label.replace', "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize('placeholder.replace', "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize('label.replaceButton', "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize('label.replaceAllButton', "Replace All");

export const findFilterButton = registerIcon('find-filter', Codicon.filter, nls.localize('findFilterIcon', 'Icon for Find Filter in find widget.'));
const NOTEBOOK_FIND_FILTERS = nls.localize('notebook.find.filter.filterAction', "Find Filters");
const NOTEBOOK_FIND_IN_MARKUP_INPUT = nls.localize('notebook.find.filter.findInMarkupInput', "Markdown Source");
const NOTEBOOK_FIND_IN_MARKUP_PREVIEW = nls.localize('notebook.find.filter.findInMarkupPreview', "Rendered Markdown");
const NOTEBOOK_FIND_IN_CODE_INPUT = nls.localize('notebook.find.filter.findInCodeInput', "Code Cell Source");
const NOTEBOOK_FIND_IN_CODE_OUTPUT = nls.localize('notebook.find.filter.findInCodeOutput', "Code Cell Output");

const NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH = 419;
const NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING = 4;
class NotebookFindFilterActionViewItem extends DropdownMenuActionViewItem {
	constructor(readonly filters: NotebookFindFilters, action: IAction, options: IActionViewItemOptions, actionRunner: IActionRunner, @IContextMenuService contextMenuService: IContextMenuService) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				...options,
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT
			}
		);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	private getActions(): IAction[] {
		const markdownInput: IAction = {
			checked: this.filters.markupInput,
			class: undefined,
			enabled: true,
			id: 'findInMarkdownInput',
			label: NOTEBOOK_FIND_IN_MARKUP_INPUT,
			run: async () => {
				this.filters.markupInput = !this.filters.markupInput;
			},
			tooltip: ''
		};

		const markdownPreview: IAction = {
			checked: this.filters.markupPreview,
			class: undefined,
			enabled: true,
			id: 'findInMarkdownInput',
			label: NOTEBOOK_FIND_IN_MARKUP_PREVIEW,
			run: async () => {
				this.filters.markupPreview = !this.filters.markupPreview;
			},
			tooltip: ''
		};

		const codeInput: IAction = {
			checked: this.filters.codeInput,
			class: undefined,
			enabled: true,
			id: 'findInCodeInput',
			label: NOTEBOOK_FIND_IN_CODE_INPUT,
			run: async () => {
				this.filters.codeInput = !this.filters.codeInput;
			},
			tooltip: ''
		};

		const codeOutput = {
			checked: this.filters.codeOutput,
			class: undefined,
			enabled: true,
			id: 'findInCodeOutput',
			label: NOTEBOOK_FIND_IN_CODE_OUTPUT,
			run: async () => {
				this.filters.codeOutput = !this.filters.codeOutput;
			},
			tooltip: '',
			dispose: () => null
		};

		if (isSafari) {
			return [
				markdownInput,
				codeInput
			];
		} else {
			return [
				markdownInput,
				markdownPreview,
				new Separator(),
				codeInput,
				codeOutput,
			];
		}

	}

	protected override updateChecked(): void {
		this.element!.classList.toggle('checked', this._action.checked);
	}
}

export class NotebookFindInputFilterButton extends Disposable {
	private _filterButtonContainer: HTMLElement;
	private _actionbar: ActionBar | null = null;
	private _filtersAction: IAction;
	private _toggleStyles: IToggleStyles;

	constructor(
		readonly filters: NotebookFindFilters,
		readonly contextMenuService: IContextMenuService,
		readonly instantiationService: IInstantiationService,
		options: IFindInputOptions,
		tooltip: string = NOTEBOOK_FIND_FILTERS,
	) {

		super();
		this._toggleStyles = options.toggleStyles;

		this._filtersAction = this._register(new Action('notebookFindFilterAction', tooltip, 'notebook-filters ' + ThemeIcon.asClassName(filterIcon)));
		this._filtersAction.checked = false;
		this._filterButtonContainer = dom.$('.find-filter-button');
		this._filterButtonContainer.classList.add('monaco-custom-toggle');
		this.createFilters(this._filterButtonContainer);
	}

	get container() {
		return this._filterButtonContainer;
	}

	width() {
		return 2 /*margin left*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	enable(): void {
		this.container.setAttribute('aria-disabled', String(false));
	}

	disable(): void {
		this.container.setAttribute('aria-disabled', String(true));
	}

	set visible(visible: boolean) {
		this._filterButtonContainer.style.display = visible ? '' : 'none';
	}

	get visible() {
		return this._filterButtonContainer.style.display !== 'none';
	}

	applyStyles(filterChecked: boolean): void {
		const toggleStyles = this._toggleStyles;

		this._filterButtonContainer.style.border = '1px solid transparent';
		this._filterButtonContainer.style.borderRadius = '3px';
		this._filterButtonContainer.style.borderColor = (filterChecked && toggleStyles.inputActiveOptionBorder) || '';
		this._filterButtonContainer.style.color = (filterChecked && toggleStyles.inputActiveOptionForeground) || 'inherit';
		this._filterButtonContainer.style.backgroundColor = (filterChecked && toggleStyles.inputActiveOptionBackground) || '';
	}

	private createFilters(container: HTMLElement): void {
		this._actionbar = this._register(new ActionBar(container, {
			actionViewItemProvider: (action, options) => {
				if (action.id === this._filtersAction.id) {
					return this.instantiationService.createInstance(NotebookFindFilterActionViewItem, this.filters, action, options, this._register(new ActionRunner()));
				}
				return undefined;
			}
		}));
		this._actionbar.push(this._filtersAction, { icon: true, label: false });
	}
}

export class NotebookFindInput extends FindInput {
	private _findFilter: NotebookFindInputFilterButton;
	private _filterChecked: boolean = false;

	constructor(
		readonly filters: NotebookFindFilters,
		contextKeyService: IContextKeyService,
		readonly contextMenuService: IContextMenuService,
		readonly instantiationService: IInstantiationService,
		parent: HTMLElement | null,
		contextViewProvider: IContextViewProvider,
		options: IFindInputOptions,
	) {
		super(parent, contextViewProvider, options);

		this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
		this._findFilter = this._register(new NotebookFindInputFilterButton(filters, contextMenuService, instantiationService, options));

		this.inputBox.paddingRight = (this.caseSensitive?.width() ?? 0) + (this.wholeWords?.width() ?? 0) + (this.regex?.width() ?? 0) + this._findFilter.width();
		this.controls.appendChild(this._findFilter.container);
	}

	override setEnabled(enabled: boolean) {
		super.setEnabled(enabled);
		if (enabled && !this._filterChecked) {
			this.regex?.enable();
		} else {
			this.regex?.disable();
		}
	}

	updateFilterState(changed: boolean) {
		this._filterChecked = changed;
		if (this.regex) {
			if (this._filterChecked) {
				this.regex.disable();
				this.regex.domNode.tabIndex = -1;
				this.regex.domNode.classList.toggle('disabled', true);
			} else {
				this.regex.enable();
				this.regex.domNode.tabIndex = 0;
				this.regex.domNode.classList.toggle('disabled', false);
			}
		}
		this._findFilter.applyStyles(this._filterChecked);
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
	}
}

export abstract class SimpleFindReplaceWidget extends Widget {
	protected readonly _findInput: NotebookFindInput;
	private readonly _domNode: HTMLElement;
	private readonly _innerFindDomNode: HTMLElement;
	private readonly _focusTracker: dom.IFocusTracker;
	private readonly _findInputFocusTracker: dom.IFocusTracker;
	private readonly _updateFindHistoryDelayer: Delayer<void>;
	protected readonly _matchesCount!: HTMLElement;
	private readonly prevBtn: SimpleButton;
	private readonly nextBtn: SimpleButton;

	protected readonly _replaceInput!: ReplaceInput;
	private readonly _innerReplaceDomNode!: HTMLElement;
	private _toggleReplaceBtn!: SimpleButton;
	private readonly _replaceInputFocusTracker!: dom.IFocusTracker;
	private readonly _updateReplaceHistoryDelayer: Delayer<void>;
	protected _replaceBtn!: SimpleButton;
	protected _replaceAllBtn!: SimpleButton;

	private readonly _resizeSash: Sash;
	private _resizeOriginalWidth = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;

	private _isVisible: boolean = false;
	private _isReplaceVisible: boolean = false;
	private foundMatch: boolean = false;

	protected _progressBar!: ProgressBar;
	protected _scopedContextKeyService: IContextKeyService;

	private _filters: NotebookFindFilters;

	private readonly inSelectionToggle: Toggle;
	private cellSelectionDecorationIds: string[] = [];
	private textSelectionDecorationIds: ICellModelDecorations[] = [];

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IHoverService hoverService: IHoverService,
		protected readonly _state: FindReplaceState<NotebookFindFilters> = new FindReplaceState<NotebookFindFilters>(),
		protected readonly _notebookEditor: INotebookEditor,
		private readonly _findWidgetSearchHistory: IHistory<string> | undefined,
		private readonly _replaceWidgetHistory: IHistory<string> | undefined,
	) {
		super();

		this._register(this._state);

		const findFilters = this._configurationService.getValue<{
			markupSource: boolean;
			markupPreview: boolean;
			codeSource: boolean;
			codeOutput: boolean;
		}>(NotebookSetting.findFilters) ?? { markupSource: true, markupPreview: true, codeSource: true, codeOutput: true };

		const findHistoryConfig = this._configurationService.getValue<'never' | 'workspace'>('editor.find.history');
		const replaceHistoryConfig = this._configurationService.getValue<'never' | 'workspace'>('editor.find.replaceHistory');

		this._filters = this._register(new NotebookFindFilters(findFilters.markupSource, findFilters.markupPreview, findFilters.codeSource, findFilters.codeOutput, { findScopeType: NotebookFindScopeType.None }));
		this._state.change({ filters: this._filters }, false);

		this._register(this._filters.onDidChange(() => {
			this._state.change({ filters: this._filters }, false);
		}));

		this._domNode = document.createElement('div');
		this._domNode.classList.add('simple-fr-find-part-wrapper');

		this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, e => {
			if (!e || e.affectsConfiguration(NotebookSetting.globalToolbar)) {
				if (this._notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
					this._domNode.style.top = '26px';
				} else {
					this._domNode.style.top = '0px';
				}
			}
		}));

		this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
		this._scopedContextKeyService = this._register(contextKeyService.createScoped(this._domNode));

		const progressContainer = dom.$('.find-replace-progress');
		this._progressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
		this._domNode.appendChild(progressContainer);

		const isInteractiveWindow = contextKeyService.getContextKeyValue('notebookType') === 'interactive';
		// Toggle replace button
		this._toggleReplaceBtn = this._register(new SimpleButton({
			label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
			className: 'codicon toggle left',
			onTrigger: isInteractiveWindow ? () => { } :
				() => {
					this._isReplaceVisible = !this._isReplaceVisible;
					this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
					this._updateReplaceViewDisplay();
				}
		}, hoverService));
		this._toggleReplaceBtn.setEnabled(!isInteractiveWindow);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
		this._domNode.appendChild(this._toggleReplaceBtn.domNode);



		this._innerFindDomNode = document.createElement('div');
		this._innerFindDomNode.classList.add('simple-fr-find-part');

		this._findInput = this._register(new NotebookFindInput(
			this._filters,
			this._scopedContextKeyService,
			this.contextMenuService,
			this.instantiationService,
			null,
			this._contextViewService,
			{
				// width:FIND_INPUT_AREA_WIDTH,
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
						this.foundMatch = false;
						this.updateButtons(this.foundMatch);
						return { content: e.message };
					}
				},
				flexibleWidth: true,
				showCommonFindToggles: true,
				inputBoxStyles: defaultInputBoxStyles,
				toggleStyles: defaultToggleStyles,
				history: findHistoryConfig === 'workspace' ? this._findWidgetSearchHistory : new Set([]),
			}
		));

		// Find History with update delayer
		this._updateFindHistoryDelayer = new Delayer<void>(500);

		this.oninput(this._findInput.domNode, (e) => {
			this.foundMatch = this.onInputChanged();
			this.updateButtons(this.foundMatch);
			this._delayedUpdateFindHistory();
		});

		this._register(this._findInput.inputBox.onDidChange(() => {
			this._state.change({ searchString: this._findInput.getValue() }, true);
		}));

		this._findInput.setRegex(!!this._state.isRegex);
		this._findInput.setCaseSensitive(!!this._state.matchCase);
		this._findInput.setWholeWords(!!this._state.wholeWord);

		this._register(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));

		this._register(this._state.onFindReplaceStateChange(() => {
			this._findInput.setRegex(this._state.isRegex);
			this._findInput.setWholeWords(this._state.wholeWord);
			this._findInput.setCaseSensitive(this._state.matchCase);
			this._replaceInput.setPreserveCase(this._state.preserveCase);
		}));

		this._matchesCount = document.createElement('div');
		this._matchesCount.className = 'matchesCount';
		this._updateMatchesCount();

		this.prevBtn = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			icon: findPreviousMatchIcon,
			onTrigger: () => {
				this.find(true);
			}
		}, hoverService));

		this.nextBtn = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			icon: findNextMatchIcon,
			onTrigger: () => {
				this.find(false);
			}
		}, hoverService));

		this.inSelectionToggle = this._register(new Toggle({
			icon: findSelectionIcon,
			title: NLS_TOGGLE_SELECTION_FIND_TITLE,
			isChecked: false,
			inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
			inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
			inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground),
		}));
		this.inSelectionToggle.domNode.style.display = 'inline';

		this._register(this.inSelectionToggle.onChange(() => {
			const checked = this.inSelectionToggle.checked;
			if (checked) {
				// selection logic:
				// 1. if there are multiple cells, do that.
				// 2. if there is only one cell, do the following:
				// 		- if there is a multi-line range highlighted, textual in selection
				// 		- if there is no range, cell in selection for that cell

				const cellSelection: ICellRange[] = this._notebookEditor.getSelections();
				const textSelection: Range[] = this._notebookEditor.getSelectionViewModels()[0].getSelections();

				if (cellSelection.length > 1 || cellSelection.some(range => range.end - range.start > 1)) {
					this._filters.findScope = {
						findScopeType: NotebookFindScopeType.Cells,
						selectedCellRanges: cellSelection
					};
					this.setCellSelectionDecorations();

				} else if (textSelection.length > 1 || textSelection.some(range => range.endLineNumber - range.startLineNumber >= 1)) {
					this._filters.findScope = {
						findScopeType: NotebookFindScopeType.Text,
						selectedCellRanges: cellSelection,
						selectedTextRanges: textSelection
					};
					this.setTextSelectionDecorations(textSelection, this._notebookEditor.getSelectionViewModels()[0]);

				} else {
					this._filters.findScope = {
						findScopeType: NotebookFindScopeType.Cells,
						selectedCellRanges: cellSelection
					};
					this.setCellSelectionDecorations();
				}
			} else {
				this._filters.findScope = {
					findScopeType: NotebookFindScopeType.None
				};
				this.clearCellSelectionDecorations();
				this.clearTextSelectionDecorations();
			}
		}));

		const closeBtn = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			icon: widgetClose,
			onTrigger: () => {
				this.hide();
			}
		}, hoverService));

		this._innerFindDomNode.appendChild(this._findInput.domNode);
		this._innerFindDomNode.appendChild(this._matchesCount);
		this._innerFindDomNode.appendChild(this.prevBtn.domNode);
		this._innerFindDomNode.appendChild(this.nextBtn.domNode);
		this._innerFindDomNode.appendChild(this.inSelectionToggle.domNode);
		this._innerFindDomNode.appendChild(closeBtn.domNode);

		// _domNode wraps _innerDomNode, ensuring that
		this._domNode.appendChild(this._innerFindDomNode);

		this.onkeyup(this._innerFindDomNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});

		this._focusTracker = this._register(dom.trackFocus(this._domNode));
		this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._innerFindDomNode, 'click', (event) => {
			event.stopPropagation();
		}));

		// Replace
		this._innerReplaceDomNode = document.createElement('div');
		this._innerReplaceDomNode.classList.add('simple-fr-replace-part');

		this._replaceInput = this._register(new ContextScopedReplaceInput(null, undefined, {
			label: NLS_REPLACE_INPUT_LABEL,
			placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
			history: replaceHistoryConfig === 'workspace' ? this._replaceWidgetHistory : new Set([]),
			inputBoxStyles: defaultInputBoxStyles,
			toggleStyles: defaultToggleStyles
		}, contextKeyService, false));
		this._innerReplaceDomNode.appendChild(this._replaceInput.domNode);
		this._replaceInputFocusTracker = this._register(dom.trackFocus(this._replaceInput.domNode));
		this._register(this._replaceInputFocusTracker.onDidFocus(this.onReplaceInputFocusTrackerFocus.bind(this)));
		this._register(this._replaceInputFocusTracker.onDidBlur(this.onReplaceInputFocusTrackerBlur.bind(this)));

		// Replace History with update delayer
		this._updateReplaceHistoryDelayer = new Delayer<void>(500);

		this.oninput(this._replaceInput.domNode, (e) => {
			this._delayedUpdateReplaceHistory();
		});

		this._register(this._replaceInput.inputBox.onDidChange(() => {
			this._state.change({ replaceString: this._replaceInput.getValue() }, true);
		}));

		this._domNode.appendChild(this._innerReplaceDomNode);

		this._updateReplaceViewDisplay();

		this._replaceBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_BTN_LABEL,
			icon: findReplaceIcon,
			onTrigger: () => {
				this.replaceOne();
			}
		}, hoverService));

		// Replace all button
		this._replaceAllBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_ALL_BTN_LABEL,
			icon: findReplaceAllIcon,
			onTrigger: () => {
				this.replaceAll();
			}
		}, hoverService));

		this._innerReplaceDomNode.appendChild(this._replaceBtn.domNode);
		this._innerReplaceDomNode.appendChild(this._replaceAllBtn.domNode);

		this._resizeSash = this._register(new Sash(this._domNode, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL, size: 2 }));

		this._register(this._resizeSash.onDidStart(() => {
			this._resizeOriginalWidth = this._getDomWidth();
		}));

		this._register(this._resizeSash.onDidChange((evt: ISashEvent) => {
			let width = this._resizeOriginalWidth + evt.startX - evt.currentX;
			if (width < NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
				width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
			}

			const maxWidth = this._getMaxWidth();
			if (width > maxWidth) {
				width = maxWidth;
			}

			this._domNode.style.width = `${width}px`;

			if (this._isReplaceVisible) {
				this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.layout();
		}));

		this._register(this._resizeSash.onDidReset(() => {
			// users double click on the sash
			// try to emulate what happens with editor findWidget
			const currentWidth = this._getDomWidth();
			let width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;

			if (currentWidth <= NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
				width = this._getMaxWidth();
			}

			this._domNode.style.width = `${width}px`;
			if (this._isReplaceVisible) {
				this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.layout();
		}));
	}

	private _getMaxWidth() {
		return this._notebookEditor.getLayoutInfo().width - 64;
	}

	private _getDomWidth() {
		return dom.getTotalWidth(this._domNode) - (NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING * 2);
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), g => /^inline/.test(g));
	}

	protected abstract onInputChanged(): boolean;
	protected abstract find(previous: boolean): void;
	protected abstract replaceOne(): void;
	protected abstract replaceAll(): void;
	protected abstract onFocusTrackerFocus(): void;
	protected abstract onFocusTrackerBlur(): void;
	protected abstract onFindInputFocusTrackerFocus(): void;
	protected abstract onFindInputFocusTrackerBlur(): void;
	protected abstract onReplaceInputFocusTrackerFocus(): void;
	protected abstract onReplaceInputFocusTrackerBlur(): void;

	protected get inputValue() {
		return this._findInput.getValue();
	}

	protected get replaceValue() {
		return this._replaceInput.getValue();
	}

	protected get replacePattern() {
		if (this._state.isRegex) {
			return parseReplaceString(this.replaceValue);
		}
		return ReplacePattern.fromStaticValue(this.replaceValue);
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	public get isVisible(): boolean {
		return this._isVisible;
	}

	private _onStateChanged(e: FindReplaceStateChangedEvent): void {
		this._updateButtons();
		this._updateMatchesCount();
	}

	private _updateButtons(): void {
		this._findInput.setEnabled(this._isVisible);
		this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
		const findInputIsNonEmpty = (this._state.searchString.length > 0);
		this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
		this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);

		this._domNode.classList.toggle('replaceToggled', this._isReplaceVisible);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);

		this.foundMatch = this._state.matchesCount > 0;
		this.updateButtons(this.foundMatch);
	}

	private setCellSelectionDecorations() {
		const cellHandles: number[] = [];
		this._notebookEditor.getSelectionViewModels().forEach(viewModel => {
			cellHandles.push(viewModel.handle);
		});

		const decorations: INotebookDeltaDecoration[] = [];
		for (const handle of cellHandles) {
			decorations.push({
				handle: handle,
				options: { className: 'nb-multiCellHighlight', outputClassName: 'nb-multiCellHighlight' }
			} satisfies INotebookDeltaDecoration);
		}
		this.cellSelectionDecorationIds = this._notebookEditor.deltaCellDecorations([], decorations);
	}

	private clearCellSelectionDecorations() {
		this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
	}

	private setTextSelectionDecorations(textRanges: Range[], cell: ICellViewModel) {
		this._notebookEditor.changeModelDecorations(changeAccessor => {
			const decorations: ICellModelDeltaDecorations[] = [];
			for (const range of textRanges) {
				decorations.push({
					ownerId: cell.handle,
					decorations: [{
						range: range,
						options: {
							description: 'text search range for notebook search scope',
							isWholeLine: true,
							className: 'nb-findScope'
						}
					}]
				});
			}
			this.textSelectionDecorationIds = changeAccessor.deltaDecorations([], decorations);
		});
	}

	private clearTextSelectionDecorations() {
		this._notebookEditor.changeModelDecorations(changeAccessor => {
			changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
		});
	}

	protected _updateMatchesCount(): void {
	}

	override dispose() {
		super.dispose();

		this._domNode.remove();
	}

	public getDomNode() {
		return this._domNode;
	}

	public reveal(initialInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (this._isVisible) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;
		this.updateButtons(this.foundMatch);

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');
			this._findInput.select();
		}, 0);
	}

	public focus(): void {
		this._findInput.focus();
	}

	public show(initialInput?: string, options?: IShowNotebookFindWidgetOptions): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		this._isVisible = true;

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');

			if (options?.focus ?? true) {
				this.focus();
			}
		}, 0);
	}

	public showWithReplace(initialInput?: string, replaceInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (replaceInput) {
			this._replaceInput.setValue(replaceInput);
		}

		this._isVisible = true;
		this._isReplaceVisible = true;
		this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
		this._updateReplaceViewDisplay();

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');
			this._updateButtons();

			this._replaceInput.focus();
		}, 0);
	}

	private _updateReplaceViewDisplay(): void {
		if (this._isReplaceVisible) {
			this._innerReplaceDomNode.style.display = 'flex';
		} else {
			this._innerReplaceDomNode.style.display = 'none';
		}

		this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
	}

	public hide(): void {
		if (this._isVisible) {
			this.inSelectionToggle.checked = false;
			this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
			this._notebookEditor.changeModelDecorations(changeAccessor => {
				changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
			});

			this._domNode.classList.remove('visible-transition');
			this._domNode.setAttribute('aria-hidden', 'true');
			// Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
			setTimeout(() => {
				this._isVisible = false;
				this.updateButtons(this.foundMatch);
				this._domNode.classList.remove('visible');
			}, 200);
		}
	}

	protected _delayedUpdateFindHistory() {
		this._updateFindHistoryDelayer.trigger(this._updateFindHistory.bind(this));
	}

	protected _updateFindHistory() {
		this._findInput.inputBox.addToHistory();
	}

	protected _delayedUpdateReplaceHistory() {
		this._updateReplaceHistoryDelayer.trigger(this._updateReplaceHistory.bind(this));
	}

	protected _updateReplaceHistory() {
		this._replaceInput.inputBox.addToHistory();
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
}

// theming
registerThemingParticipant((theme, collector) => {
	collector.addRule(`
	.notebook-editor {
		--notebook-find-width: ${NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH}px;
		--notebook-find-horizontal-padding: ${NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING}px;
	}
	`);
});
