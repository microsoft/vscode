/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { HistoryInputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { KeyCode } from 'vs/base/common/keyCodes';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { toDisposable } from 'vs/base/common/lifecycle';
import { badgeBackground, badgeForeground, contrastBorder, asCssVariable } from 'vs/platform/theme/common/colorRegistry';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextScopedHistoryInputBox } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Codicon } from 'vs/base/common/codicons';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { showHistoryKeybindingHint } from 'vs/platform/history/browser/historyWidgetKeybindingHint';
import { MenuId, MenuRegistry, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { SubmenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { Widget } from 'vs/base/browser/ui/widget';
import { Emitter } from 'vs/base/common/event';
import { defaultInputBoxStyles } from 'vs/platform/theme/browser/defaultStyles';

const viewFilterMenu = new MenuId('menu.view.filter');
export const viewFilterSubmenu = new MenuId('submenu.view.filter');
MenuRegistry.appendMenuItem(viewFilterMenu, {
	submenu: viewFilterSubmenu,
	title: localize('more filters', "More Filters..."),
	group: 'navigation',
	icon: Codicon.filter,
});

class MoreFiltersActionViewItem extends SubmenuEntryActionViewItem {

	private _checked: boolean = false;
	set checked(checked: boolean) {
		if (this._checked !== checked) {
			this._checked = checked;
			this.updateChecked();
		}
	}

	protected override updateChecked(): void {
		if (this.element) {
			this.element.classList.toggle('checked', this._checked);
		}
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

}

export interface IFilterWidgetOptions {
	readonly text?: string;
	readonly placeholder?: string;
	readonly ariaLabel?: string;
	readonly history?: string[];
	readonly focusContextKey?: string;
}

export class FilterWidget extends Widget {

	readonly element: HTMLElement;
	private readonly delayedFilterUpdate: Delayer<void>;
	private readonly filterInputBox: HistoryInputBox;
	private readonly filterBadge: HTMLElement;
	private readonly toolbar: MenuWorkbenchToolBar;
	private readonly focusContextKey: IContextKey<boolean> | undefined;

	private readonly _onDidChangeFilterText = this._register(new Emitter<string>());
	readonly onDidChangeFilterText = this._onDidChangeFilterText.event;

	private moreFiltersActionViewItem: MoreFiltersActionViewItem | undefined;
	private isMoreFiltersChecked: boolean = false;

	private focusTracker: DOM.IFocusTracker;
	public get onDidFocus() { return this.focusTracker.onDidFocus; }
	public get onDidBlur() { return this.focusTracker.onDidBlur; }

	constructor(
		private readonly options: IFilterWidgetOptions,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextViewService private readonly contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
		this.delayedFilterUpdate = new Delayer<void>(400);
		this._register(toDisposable(() => this.delayedFilterUpdate.cancel()));

		if (options.focusContextKey) {
			this.focusContextKey = new RawContextKey(options.focusContextKey, false).bindTo(contextKeyService);
		}

		this.element = DOM.$('.viewpane-filter');
		[this.filterInputBox, this.focusTracker] = this.createInput(this.element);
		this._register(this.filterInputBox);
		this._register(this.focusTracker);

		const controlsContainer = DOM.append(this.element, DOM.$('.viewpane-filter-controls'));
		this.filterBadge = this.createBadge(controlsContainer);
		this.toolbar = this._register(this.createToolBar(controlsContainer));

		this.adjustInputBox();
	}

	hasFocus(): boolean {
		return this.filterInputBox.hasFocus();
	}

	focus(): void {
		this.filterInputBox.focus();
	}

	blur(): void {
		this.filterInputBox.blur();
	}

	updateBadge(message: string | undefined): void {
		this.filterBadge.classList.toggle('hidden', !message);
		this.filterBadge.textContent = message || '';
		this.adjustInputBox();
	}

	setFilterText(filterText: string): void {
		this.filterInputBox.value = filterText;
	}

	getFilterText(): string {
		return this.filterInputBox.value;
	}

	getHistory(): string[] {
		return this.filterInputBox.getHistory();
	}

	layout(width: number): void {
		this.element.parentElement?.classList.toggle('grow', width > 700);
		this.element.classList.toggle('small', width < 400);
		this.adjustInputBox();
	}

	checkMoreFilters(checked: boolean): void {
		this.isMoreFiltersChecked = checked;
		if (this.moreFiltersActionViewItem) {
			this.moreFiltersActionViewItem.checked = checked;
		}
	}

	private createInput(container: HTMLElement): [ContextScopedHistoryInputBox, DOM.IFocusTracker] {
		const inputBox = this._register(this.instantiationService.createInstance(ContextScopedHistoryInputBox, container, this.contextViewService, {
			placeholder: this.options.placeholder,
			ariaLabel: this.options.ariaLabel,
			history: this.options.history || [],
			showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
			inputBoxStyles: defaultInputBoxStyles
		}));
		if (this.options.text) {
			inputBox.value = this.options.text;
		}
		this._register(inputBox.onDidChange(filter => this.delayedFilterUpdate.trigger(() => this.onDidInputChange(inputBox!))));
		this._register(DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e: any) => this.onInputKeyDown(e, inputBox!)));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_UP, this.handleKeyboardEvent));
		this._register(DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.CLICK, (e) => {
			e.stopPropagation();
			e.preventDefault();
		}));

		const focusTracker = this._register(DOM.trackFocus(inputBox.inputElement));
		if (this.focusContextKey) {
			this._register(focusTracker.onDidFocus(() => this.focusContextKey!.set(true)));
			this._register(focusTracker.onDidBlur(() => this.focusContextKey!.set(false)));
			this._register(toDisposable(() => this.focusContextKey!.reset()));
		}
		return [inputBox, focusTracker];
	}

	private createBadge(container: HTMLElement): HTMLElement {
		const filterBadge = DOM.append(container, DOM.$('.viewpane-filter-badge.hidden'));
		filterBadge.style.backgroundColor = asCssVariable(badgeBackground);
		filterBadge.style.color = asCssVariable(badgeForeground);
		filterBadge.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
		return filterBadge;
	}

	private createToolBar(container: HTMLElement): MenuWorkbenchToolBar {
		return this.instantiationService.createInstance(MenuWorkbenchToolBar, container, viewFilterMenu,
			{
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				actionViewItemProvider: (action: IAction) => {
					if (action instanceof SubmenuItemAction && action.item.submenu.id === viewFilterSubmenu.id) {
						this.moreFiltersActionViewItem = this.instantiationService.createInstance(MoreFiltersActionViewItem, action, undefined);
						this.moreFiltersActionViewItem.checked = this.isMoreFiltersChecked;
						return this.moreFiltersActionViewItem;
					}
					return undefined;
				}
			});
	}

	private onDidInputChange(inputbox: HistoryInputBox) {
		inputbox.addToHistory();
		this._onDidChangeFilterText.fire(inputbox.value);
	}

	private adjustInputBox(): void {
		this.filterInputBox.inputElement.style.paddingRight = this.element.classList.contains('small') || this.filterBadge.classList.contains('hidden') ? '25px' : '150px';
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
		if (event.equals(KeyCode.Tab) && !this.toolbar.isEmpty()) {
			this.toolbar.focus();
			handled = true;
		}
		if (handled) {
			event.stopPropagation();
			event.preventDefault();
		}
	}

}
