/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { Action, IAction, IActionRunner } from 'vs/base/common/actions';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService, registerThemingParticipant, ICssStyleCollector, IColorTheme, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { attachInputBoxStyler, attachStylerCallback } from 'vs/platform/theme/common/styler';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { badgeBackground, badgeForeground, contrastBorder, inputActiveOptionBorder, inputActiveOptionBackground, inputActiveOptionForeground } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ContextScopedHistoryInputBox } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { Event, Emitter } from 'vs/base/common/event';
import { AnchorAlignment } from 'vs/base/browser/ui/contextview/contextview';
import { Codicon } from 'vs/base/common/codicons';
import { BaseActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { CommentsViewFilterFocusContextKey, CommentsViewSmallLayoutContextKey, ICommentsView } from 'vs/workbench/contrib/comments/browser/comments';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { COMMENTS_VIEW_ID } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';

export interface CommentsFiltersChangeEvent {
	filterText?: boolean;
	showResolved?: boolean;
	showUnresolved?: boolean;
	layout?: boolean;
}

export interface CommentsFiltersOptions {
	filterText: string;
	filterHistory: string[];
	showResolved: boolean;
	showUnresolved: boolean;
	layout: DOM.Dimension;
}

export class CommentsFilters extends Disposable {

	private readonly _onDidChange: Emitter<CommentsFiltersChangeEvent> = this._register(new Emitter<CommentsFiltersChangeEvent>());
	readonly onDidChange: Event<CommentsFiltersChangeEvent> = this._onDidChange.event;

	constructor(options: CommentsFiltersOptions) {
		super();
		this._filterText = options.filterText;
		this._showResolved = options.showResolved;
		this._showUnresolved = options.showUnresolved;
		this.filterHistory = options.filterHistory;
		this._layout = options.layout;
	}

	private _filterText: string;
	get filterText(): string {
		return this._filterText;
	}
	set filterText(filterText: string) {
		if (this._filterText !== filterText) {
			this._filterText = filterText;
			this._onDidChange.fire({ filterText: true });
		}
	}

	filterHistory: string[];

	private _showUnresolved: boolean = true;
	get showUnresolved(): boolean {
		return this._showUnresolved;
	}
	set showUnresolved(showUnresolved: boolean) {
		if (this._showUnresolved !== showUnresolved) {
			this._showUnresolved = showUnresolved;
			this._onDidChange.fire(<CommentsFiltersChangeEvent>{ showUnresolved: true });
		}
	}

	private _showResolved: boolean = true;
	get showResolved(): boolean {
		return this._showResolved;
	}
	set showResolved(showResolved: boolean) {
		if (this._showResolved !== showResolved) {
			this._showResolved = showResolved;
			this._onDidChange.fire(<CommentsFiltersChangeEvent>{ showResolved: true });
		}
	}

	private _layout: DOM.Dimension = new DOM.Dimension(0, 0);
	get layout(): DOM.Dimension {
		return this._layout;
	}
	set layout(layout: DOM.Dimension) {
		if (this._layout.width !== layout.width || this._layout.height !== layout.height) {
			this._layout = layout;
			this._onDidChange.fire(<CommentsFiltersChangeEvent>{ layout: true });
		}
	}
}

class FiltersDropdownMenuActionViewItem extends DropdownMenuActionViewItem {

	constructor(
		action: IAction, private filters: CommentsFilters, actionRunner: IActionRunner,
		@IContextMenuService contextMenuService: IContextMenuService
	) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
				menuAsChild: true
			}
		);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	private getActions(): IAction[] {
		return [
			{
				checked: this.filters.showResolved,
				class: undefined,
				enabled: true,
				id: 'showResolved',
				label: localize('showResolved', "Show Resolved"),
				run: async () => this.filters.showResolved = !this.filters.showResolved,
				tooltip: ''
			},
			{
				checked: this.filters.showUnresolved,
				class: undefined,
				enabled: true,
				id: 'showUnresolved',
				label: localize('showUnresolved', "Show Unresolved"),
				run: async () => this.filters.showUnresolved = !this.filters.showUnresolved,
				tooltip: ''
			}
		];
	}

	override updateChecked(): void {
		this.element!.classList.toggle('checked', this._action.checked);
	}
}


const filterIcon = registerIcon('comments-view-filter', Codicon.filter, localize('comments.filterIcon', 'Icon for the filter configuration in the Comments view.'));

export class CommentsFilterActionViewItem extends BaseActionViewItem {

	private delayedFilterUpdate: Delayer<void>;
	private container: HTMLElement | null = null;
	private filterInputBox: HistoryInputBox | null = null;
	private filterBadge: HTMLElement | null = null;
	private focusContextKey: IContextKey<boolean>;
	private readonly filtersAction: IAction;
	private actionbar: ActionBar | null = null;
	private keybindingService;

	constructor(
		action: IAction,
		private commentsView: ICommentsView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IThemeService private readonly themeService: IThemeService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		super(null, action);
		this.keybindingService = keybindingService;
		this.focusContextKey = CommentsViewFilterFocusContextKey.bindTo(contextKeyService);
		this.delayedFilterUpdate = new Delayer<void>(400);
		this._register(toDisposable(() => this.delayedFilterUpdate.cancel()));
		this._register(commentsView.onDidFocusFilter(() => this.focus()));
		this._register(commentsView.onDidClearFilterText(() => this.clearFilterText()));
		this.filtersAction = new Action('commentsFiltersAction', localize('commentsFiltersAction', "More Filters..."), 'comments-filters ' + ThemeIcon.asClassName(filterIcon));
		this.filtersAction.checked = this.hasFiltersChanged();
		this._register(commentsView.filters.onDidChange(e => this.onDidFiltersChange(e)));
	}

	override render(container: HTMLElement): void {
		this.container = container;
		this.container.classList.add('comments-panel-action-filter-container');

		this.element = DOM.append(this.container, DOM.$(''));
		this.element.className = this.class;
		this.createInput(this.element);
		this.createControls(this.element);
		this.updateClass();

		this.adjustInputBox();
	}

	override focus(): void {
		if (this.filterInputBox) {
			this.filterInputBox.focus();
		}
	}

	override blur(): void {
		if (this.filterInputBox) {
			this.filterInputBox.blur();
		}
	}

	override setFocusable(): void {
		// noop input elements are focusable by default
	}

	override get trapsArrowNavigation(): boolean {
		return true;
	}

	private clearFilterText(): void {
		if (this.filterInputBox) {
			this.filterInputBox.value = '';
		}
	}

	private onDidFiltersChange(e: CommentsFiltersChangeEvent): void {
		this.filtersAction.checked = this.hasFiltersChanged();
		if (e.layout) {
			this.updateClass();
		}
	}

	private hasFiltersChanged(): boolean {
		return !this.commentsView.filters.showResolved || !this.commentsView.filters.showUnresolved;
	}

	private createInput(container: HTMLElement): void {
		this.filterInputBox = this._register(this.instantiationService.createInstance(ContextScopedHistoryInputBox, container, this.contextViewService, {
			placeholder: localize('comments.filter.placeholder', "Filter (e.g. text, author)"),
			ariaLabel: localize('comments.filter.ariaLabel', "Filter comments"),
			history: this.commentsView.filters.filterHistory,
			showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService)
		}));
		this._register(attachInputBoxStyler(this.filterInputBox, this.themeService));
		this.filterInputBox.value = this.commentsView.filters.filterText;
		this._register(this.filterInputBox.onDidChange(filter => this.delayedFilterUpdate.trigger(() => this.onDidInputChange(this.filterInputBox!))));
		this._register(this.commentsView.filters.onDidChange((event: CommentsFiltersChangeEvent) => {
			if (event.filterText) {
				this.filterInputBox!.value = this.commentsView.filters.filterText;
			}
		}));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, DOM.EventType.KEY_DOWN, (e: any) => this.onInputKeyDown(e, this.filterInputBox!)));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_UP, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(this.filterInputBox.inputElement, DOM.EventType.CLICK, (e) => {
			e.stopPropagation();
			e.preventDefault();
		}));

		const focusTracker = this._register(DOM.trackFocus(this.filterInputBox.inputElement));
		this._register(focusTracker.onDidFocus(() => this.focusContextKey.set(true)));
		this._register(focusTracker.onDidBlur(() => this.focusContextKey.set(false)));
		this._register(toDisposable(() => this.focusContextKey.reset()));
	}

	private createControls(container: HTMLElement): void {
		const controlsContainer = DOM.append(container, DOM.$('.comments-panel-filter-controls'));
		this.createBadge(controlsContainer);
		this.createFilters(controlsContainer);
	}

	private createBadge(container: HTMLElement): void {
		const filterBadge = this.filterBadge = DOM.append(container, DOM.$('.comments-panel-filter-badge'));
		this._register(attachStylerCallback(this.themeService, { badgeBackground, badgeForeground, contrastBorder }, colors => {
			const background = colors.badgeBackground ? colors.badgeBackground.toString() : '';
			const foreground = colors.badgeForeground ? colors.badgeForeground.toString() : '';
			const border = colors.contrastBorder ? colors.contrastBorder.toString() : '';

			filterBadge.style.backgroundColor = background;

			filterBadge.style.borderWidth = border ? '1px' : '';
			filterBadge.style.borderStyle = border ? 'solid' : '';
			filterBadge.style.borderColor = border;
			filterBadge.style.color = foreground;
		}));
		this.updateBadge();
		this._register(this.commentsView.onDidChangeFilterStats(() => this.updateBadge()));
	}

	private createFilters(container: HTMLElement): void {
		this.actionbar = this._register(new ActionBar(container, {
			actionViewItemProvider: action => {
				if (action.id === this.filtersAction.id) {
					return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, this.commentsView.filters, this.actionRunner);
				}
				return undefined;
			}
		}));
		this.actionbar.push(this.filtersAction, { icon: true, label: false });
	}

	private onDidInputChange(inputbox: HistoryInputBox) {
		inputbox.addToHistory();
		this.commentsView.filters.filterText = inputbox.value;
		this.commentsView.filters.filterHistory = inputbox.getHistory();
	}

	private updateBadge(): void {
		if (this.filterBadge) {
			const { total, filtered } = this.commentsView.getFilterStats();
			this.filterBadge.classList.toggle('hidden', (total === filtered && !this.filterInputBox?.value) || total === 0);
			this.filterBadge.textContent = localize('showing filtered comments', "Showing {0} of {1}", filtered, total);
			this.adjustInputBox();
		}
	}

	private adjustInputBox(): void {
		if (this.element && this.filterInputBox && this.filterBadge) {
			this.filterInputBox.inputElement.style.paddingRight = this.element.classList.contains('small') || this.filterBadge.classList.contains('hidden') ? '25px' : '150px';
		}
	}

	// Action toolbar is swallowing some keys for action items which should not be for an input box
	private handleKeyboardEvent(event: StandardKeyboardEvent) {
		if (event.equals(KeyCode.Space)
			|| event.equals(KeyCode.LeftArrow)
			|| event.equals(KeyCode.RightArrow)
		) {
			event.stopPropagation();
		}
	}

	private onInputKeyDown(event: StandardKeyboardEvent, filterInputBox: HistoryInputBox) {
		let handled = false;
		if (event.equals(KeyCode.Tab)) {
			this.actionbar?.focus();
			handled = true;
		}
		if (handled) {
			event.stopPropagation();
			event.preventDefault();
		}
	}

	protected override updateClass(): void {
		if (this.element && this.container) {
			this.element.className = this.class;
			this.container.classList.toggle('grow', this.element.classList.contains('grow'));
			this.adjustInputBox();
		}
	}

	protected get class(): string {
		if (this.commentsView.filters.layout.width > 600) {
			return 'comments-panel-action-filter grow';
		} else if (this.commentsView.filters.layout.width < 400) {
			return 'comments-panel-action-filter small';
		} else {
			return 'comments-panel-action-filter';
		}
	}
}

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsFocusViewFromFilter',
			title: localize('focusCommentsList', "Focus Comments view"),
			keybinding: {
				when: CommentsViewFilterFocusContextKey,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.DownArrow
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.focus();
	}
});

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsClearFilterText',
			title: localize('commentsClearFilterText', "Clear filter text"),
			keybinding: {
				when: CommentsViewFilterFocusContextKey,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Escape
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.clearFilterText();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: `workbench.actions.treeView.${COMMENTS_VIEW_ID}.filter`,
			title: localize('filter', "Filter"),
			menu: {
				id: MenuId.ViewTitle,
				when: ContextKeyExpr.and(ContextKeyExpr.equals('view', COMMENTS_VIEW_ID), CommentsViewSmallLayoutContextKey.negate()),
				group: 'navigation',
				order: 1,
			},
		});
	}
	async run(): Promise<void> { }
});

registerAction2(class extends ViewAction<ICommentsView> {
	constructor() {
		super({
			id: 'commentsFocusFilter',
			title: localize('focusCommentsFilter', "Focus comments filter"),
			keybinding: {
				when: FocusedViewContext.isEqualTo(COMMENTS_VIEW_ID),
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyCode.KeyF
			},
			viewId: COMMENTS_VIEW_ID
		});
	}
	async runInView(serviceAccessor: ServicesAccessor, commentsView: ICommentsView): Promise<void> {
		commentsView.focusFilter();
	}
});

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const inputActiveOptionBorderColor = theme.getColor(inputActiveOptionBorder);
	if (inputActiveOptionBorderColor) {
		collector.addRule(`.comments-panel-action-filter > .comments-panel-filter-controls > .monaco-action-bar .action-label.comments-filters.checked { border-color: ${inputActiveOptionBorderColor}; }`);
	}
	const inputActiveOptionForegroundColor = theme.getColor(inputActiveOptionForeground);
	if (inputActiveOptionForegroundColor) {
		collector.addRule(`.comments-panel-action-filter > .comments-panel-filter-controls > .monaco-action-bar .action-label.comments-filters.checked { color: ${inputActiveOptionForegroundColor}; }`);
	}
	const inputActiveOptionBackgroundColor = theme.getColor(inputActiveOptionBackground);
	if (inputActiveOptionBackgroundColor) {
		collector.addRule(`.comments-panel-action-filter > .comments-panel-filter-controls > .monaco-action-bar .action-label.comments-filters.checked { background-color: ${inputActiveOptionBackgroundColor}; }`);
	}
});
