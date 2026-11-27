/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { IAction, SubmenuAction, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

export interface ISessionsFilterChip {
	readonly id: string;
	readonly label: string;
	readonly icon?: ThemeIcon;
	readonly edit: (anchor: HTMLElement) => void;
	readonly clear?: () => void;
	readonly hasMenu?: boolean;
	readonly hasListbox?: boolean;
}

interface IRenderedFilterChip {
	model: ISessionsFilterChip;
	readonly element: HTMLElement;
	readonly edit: HTMLElement;
	readonly clear?: HTMLElement;
}

export class SessionsFilterChips extends Disposable {
	static visibleChipCount(width: number, chipWidths: readonly number[], controlsWidth: number, overflowWidth: number, gap: number, pinnedCount = 0): number {
		const chipTotal = chipWidths.reduce((sum, value) => sum + value + gap, 0);
		if (chipTotal + controlsWidth <= width) {
			return chipWidths.length;
		}
		let used = controlsWidth + overflowWidth + gap;
		let visible = 0;
		for (const chipWidth of chipWidths) {
			used += chipWidth + gap;
			if (used > width) {
				break;
			}
			visible++;
		}
		return Math.max(pinnedCount, visible);
	}

	readonly element: HTMLElement;
	private readonly controls: HTMLElement;
	private readonly chipContainer: HTMLElement;
	private readonly overflow: Button;
	private readonly filter: Button;
	private readonly hoverLifecycle = { groupId: generateUuid() };
	private readonly chipDisposables = this._register(new DisposableStore());
	private chips: readonly IRenderedFilterChip[] = [];

	constructor(
		container: HTMLElement,
		getFilterActions: (anchor: HTMLElement) => readonly IAction[],
		openSearch: () => void,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IHoverService private readonly hoverService: IHoverService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
	) {
		super();
		this.element = DOM.append(container, DOM.$('.sessions-filter-chips', { role: 'group', 'aria-label': localize('sessionFilters', "Session Filters") }));
		this.controls = DOM.append(this.element, DOM.$('.sessions-filter-chips-controls'));
		this.filter = this.createIconButton(localize('filterSessions', "Filter Sessions"), Codicon.filter, () => {
			const anchor = this.filter.element;
			this.showMenu(anchor, getFilterActions(anchor));
		});
		this.filter.element.setAttribute('aria-haspopup', 'menu');
		this.filter.element.setAttribute('aria-expanded', 'false');
		this.createIconButton(localize('findSession', "Find Session"), Codicon.search, openSearch, 'sessionsViewPane.find');
		this.chipContainer = DOM.append(this.element, DOM.$('.sessions-filter-chips-items'));
		this.overflow = this.createButton(this.element, '', this._store, () => this.openOverflow());
		this.overflow.element.classList.add('sessions-filter-chip-overflow');
		this.overflow.element.setAttribute('aria-haspopup', 'menu');
		const targetWindow = DOM.getWindow(container);
		const pendingLayout = this._register(new MutableDisposable());
		const observer = this._register(new DOM.DisposableResizeObserver('SessionsFilterChips', () => {
			pendingLayout.value ??= DOM.scheduleAtNextAnimationFrame(targetWindow, () => {
				pendingLayout.clear();
				this.layout();
			});
		}, targetWindow));
		this._register(observer.observe(this.element));
	}

	get filterCount(): number {
		return this.chips.filter(({ model }) => model.clear).length;
	}

	setChips(models: readonly ISessionsFilterChip[]): void {
		if (models.length === this.chips.length && models.every((model, index) => {
			const previous = this.chips[index].model;
			return previous.id === model.id && previous.label === model.label && previous.icon?.id === model.icon?.id
				&& !!previous.clear === !!model.clear && previous.hasMenu === model.hasMenu && previous.hasListbox === model.hasListbox;
		})) {
			this.chips.forEach((chip, index) => chip.model = models[index]);
			return;
		}
		const active = DOM.getActiveElement();
		const previous = active ? this.chips.findIndex(chip => chip.edit === active || chip.clear === active) : -1;
		const previousId = this.chips[previous]?.model.id;
		const clearing = previous >= 0 && this.chips[previous].clear === active;
		this.chipDisposables.clear();
		DOM.clearNode(this.chipContainer);
		this.chips = models.map(model => {
			const element = DOM.append(this.chipContainer, DOM.$('.sessions-filter-chip'));
			element.classList.toggle('active', !!model.clear);
			element.classList.toggle('scope', !!model.hasListbox);
			const edit = this.createButton(element, model.label, this.chipDisposables, () => chip.model.edit(edit.element));
			if (model.icon) {
				this.prependIcon(edit, model.icon);
			}
			if (model.hasListbox || model.hasMenu !== false) {
				edit.element.setAttribute('aria-haspopup', model.hasListbox ? 'listbox' : 'menu');
				edit.element.setAttribute('aria-expanded', 'false');
			}
			if (model.hasListbox) {
				DOM.append(edit.element, DOM.$(`span.sessions-filter-chip-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDown)}`, { 'aria-hidden': 'true' }));
			}
			this.chipDisposables.add(this.hoverService.setupDelayedHover(edit.element, { content: model.label, style: HoverStyle.Pointer }, this.hoverLifecycle));
			const clear = model.clear && this.createButton(element, '', this.chipDisposables, () => chip.model.clear?.());
			if (clear) {
				clear.element.classList.add('sessions-filter-chip-clear');
				clear.element.setAttribute('aria-label', localize('clearFilter', "Clear {0}", model.label));
				DOM.append(clear.element, DOM.$(ThemeIcon.asCSSSelector(Codicon.closeCompact), { 'aria-hidden': 'true' }));
			}
			const chip: IRenderedFilterChip = { model, element, edit: edit.element, clear: clear?.element };
			return chip;
		});
		this.layout();
		if (previous >= 0 && !this.element.hidden) {
			const chip = this.chips.find(chip => chip.model.id === previousId) ?? this.chips[previous];
			if (chip && !chip.element.hidden) {
				(clearing ? chip.clear ?? chip.edit : chip.edit).focus();
			} else {
				this.focusOverflowOrFilter();
			}
		}
	}

	private createIconButton(label: string, icon: ThemeIcon, run: () => void, commandId?: string): Button {
		const button = this.createButton(this.controls, '', this._store, () => {
			this.hoverService.hideHover(true);
			run();
		});
		button.icon = icon;
		button.setAriaLabel(label);
		this._register(this.hoverService.setupDelayedHover(button.element, () => ({
			content: commandId ? this.keybindingService.appendKeybinding(label, commandId) : label,
			style: HoverStyle.Pointer,
		}), this.hoverLifecycle));
		return button;
	}

	private createButton(container: HTMLElement, label: string, store: DisposableStore, run: () => void): Button {
		const button = store.add(new Button(container, { ariaLabel: label || undefined }));
		button.element.classList.add('sessions-filter-chip-button');
		button.label = label;
		store.add(button.onDidClick(run));
		return button;
	}

	private prependIcon(button: Button, icon: ThemeIcon): void {
		button.element.prepend(DOM.$(`span.sessions-filter-chip-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' }));
	}

	private layout(): void {
		if (!this.element.clientWidth) {
			return;
		}
		const hadOverflowFocus = DOM.getActiveElement() === this.overflow.element;
		for (const { element } of this.chips) {
			element.hidden = false;
		}
		this.chipContainer.hidden = false;
		this.overflow.element.hidden = false;
		this.overflow.label = localize('moreFilterCount', "+{0}", this.chips.length);
		const style = DOM.getWindow(this.element).getComputedStyle(this.element);
		const width = this.element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		const gap = parseFloat(style.columnGap) || 0;
		this.chipContainer.style.flexShrink = '0';
		const widths = this.chips.map(chip => chip.element.getBoundingClientRect().width);
		const controlsWidth = this.controls.getBoundingClientRect().width;
		const overflowWidth = this.overflow.element.getBoundingClientRect().width;
		this.chipContainer.style.flexShrink = '';
		const firstOptional = this.chips.findIndex(({ model }) => !model.hasListbox);
		const pinnedCount = firstOptional === -1 ? this.chips.length : firstOptional;
		const visible = SessionsFilterChips.visibleChipCount(width, widths, controlsWidth, overflowWidth, gap, pinnedCount);
		const hidden = this.chips.length - visible;
		const focusedChip = this.chips.find(chip => DOM.isAncestorOfActiveElement(chip.element));
		for (const [index, { element }] of this.chips.entries()) {
			element.hidden = index >= visible;
		}
		this.chipContainer.hidden = visible === 0;
		this.overflow.element.hidden = hidden === 0;
		this.overflow.label = localize('moreFilterCount', "+{0}", hidden);
		this.overflow.element.setAttribute('aria-label', localize('moreFilters', "More Filters ({0})", hidden));
		if (focusedChip?.element.hidden || (hadOverflowFocus && !hidden)) {
			this.focusOverflowOrFilter();
		}
	}

	private focusOverflowOrFilter(): void {
		(this.overflow.element.hidden ? this.filter : this.overflow).focus();
	}

	private openOverflow(): void {
		const anchor = this.overflow.element;
		const actions = this.chips.filter(chip => chip.element.hidden).map(({ model }) => {
			const edit = toAction({ id: model.id, label: model.clear ? localize('editFilter', "Edit {0}", model.label) : model.label, run: () => model.edit(anchor) });
			return model.clear
				? new SubmenuAction(model.id, model.label, [edit, toAction({ id: `${model.id}.clear`, label: localize('clearFilter', "Clear {0}", model.label), run: model.clear })])
				: edit;
		});
		this.showMenu(anchor, actions);
	}

	private showMenu(anchor: HTMLElement, actions: readonly IAction[]): void {
		anchor.setAttribute('aria-expanded', 'true');
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions.slice(),
			autoSelectItem: true,
			onHide: () => {
				anchor.setAttribute('aria-expanded', 'false');
				if (anchor.isConnected && !this.element.hidden) {
					(anchor.hidden ? this.filter.element : anchor).focus();
				}
			},
		});
	}
}
