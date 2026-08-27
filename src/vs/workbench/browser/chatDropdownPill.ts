/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../base/common/actions.js';
import { Codicon } from '../../base/common/codicons.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { IObservable, autorun, derived } from '../../base/common/observable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { asCssVariable } from '../../platform/theme/common/colorUtils.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../platform/actionWidget/browser/actionWidget.js';
import { getIconClasses } from '../../editor/common/services/getIconClasses.js';
import { ILanguageService } from '../../editor/common/languages/language.js';
import { IModelService } from '../../editor/common/services/model.js';
import { FileKind } from '../../platform/files/common/files.js';
import { ChatPillActionViewItem, getChatPillEntries, type IChatPill, type IChatPillEntry, type IChatPillSection } from './chatPills.js';
import { ChatResourcePillActionViewItem } from './chatResourcePill.js';
import type { ResourceLabels } from './labels.js';
import type { IInstantiationService } from '../../platform/instantiation/common/instantiation.js';

/**
 * How a pill holding exactly one entry renders. Several entries always collapse
 * into the summary and its dropdown.
 */
export const enum ChatPillSingleEntry {
	/** The entry itself — its own icon and label — activated directly. */
	Inline = 'inline',
	/**
	 * The entry itself only when it is a resource, so a file keeps its name and
	 * themed icon; anything else summarizes.
	 */
	InlineResource = 'inlineResource',
	/** The summary and its dropdown, as for several entries. */
	Summary = 'summary',
}

/** Presentation of a {@link ChatDropdownPillActionViewItem}. */
export interface IChatDropdownPillOptions {
	/** Identifies the pill's dropdown to the action widget service. */
	readonly widgetId: string;
	/** Icon of the summary shown for several entries. */
	readonly icon: ThemeIcon;
	/** Accessible name of the dropdown. */
	readonly title: string;
	/** Summary label, e.g. `3 Artifacts`. */
	readonly summaryLabel: (count: number) => string;
	/** Accessible summary label, e.g. `Show 3 artifacts`. */
	readonly summaryAriaLabel: (count: number) => string;
	/** How a lone entry renders. Defaults to {@link ChatPillSingleEntry.Inline}. */
	readonly singleEntry?: ChatPillSingleEntry;
}

/**
 * The entry a pill shows in place of its summary, or `undefined` when it
 * summarizes. The single place {@link IChatDropdownPillOptions.singleEntry} is
 * interpreted, shared by the factory that picks the rendering and the view item
 * that picks the label.
 */
function getInlineEntry(entries: readonly IChatPillEntry[], options: IChatDropdownPillOptions): IChatPillEntry | undefined {
	if (entries.length !== 1) {
		return undefined;
	}
	const entry = entries[0];
	switch (options.singleEntry ?? ChatPillSingleEntry.Inline) {
		case ChatPillSingleEntry.Inline: return entry;
		case ChatPillSingleEntry.InlineResource: return entry.resource ? entry : undefined;
		case ChatPillSingleEntry.Summary: return undefined;
	}
}

/**
 * The `icon + label` pill extended with a dropdown. A single entry renders as
 * that entry's own icon and label and opens it directly; several collapse into
 * a summary whose dropdown lists them grouped by section.
 */
export class ChatDropdownPillActionViewItem extends ChatPillActionViewItem {

	protected override get itemModifierClass(): string { return 'chat-dropdown-pill'; }
	protected override get buttonModifierClass(): string { return 'chat-dropdown-pill-button'; }

	constructor(
		action: IAction,
		options: IActionViewItemOptions,
		private readonly _sections: IObservable<readonly IChatPillSection[]>,
		private readonly _pillOptions: IChatDropdownPillOptions,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IModelService private readonly _modelService: IModelService,
	) {
		super(undefined, action, options);
	}

	private _dropdownVisible = false;

	protected override renderContent(): void {
		this._register(autorun(reader => {
			this._sections.read(reader);
			this.updateLabel();
			this.updateTooltip();
			this.updateAriaLabel();
			this._updatePopupState();
		}));
	}

	/**
	 * A summarized pill opens a listbox, so it has to advertise the popup and
	 * whether it is open. A single-entry pill activates directly and must not.
	 */
	private _updatePopupState(): void {
		const element = this.button?.element;
		if (!element) {
			return;
		}
		if (this.isSummarized) {
			element.setAttribute('aria-haspopup', 'listbox');
			element.setAttribute('aria-expanded', String(this._dropdownVisible));
		} else {
			element.removeAttribute('aria-haspopup');
			element.removeAttribute('aria-expanded');
		}
	}

	/** Whether the pill stands for its entries rather than showing a single one. */
	protected get isSummarized(): boolean {
		const entries = this.entries;
		return entries.length > 0 && !getInlineEntry(entries, this._pillOptions);
	}

	protected get entries(): readonly IChatPillEntry[] {
		return getChatPillEntries(this._sections.get());
	}

	protected override getIconElement(): HTMLElement | undefined {
		const icon = this.isSummarized ? this._pillOptions.icon : this.entries.at(0)?.icon;
		return icon ? this.createIconElement(icon) : undefined;
	}

	/** Renders a themed glyph, keeping a state color the button would otherwise flatten. */
	protected createIconElement(icon: ThemeIcon): HTMLElement {
		const iconElement = $(`span.chat-pill-icon${ThemeIcon.asCSSSelector(icon)}`, { 'aria-hidden': 'true' });
		if (icon.color) {
			// Inline `!important` wins over `button.css`'s `.monaco-text-button .codicon
			// { color: inherit !important }`, so the glyph keeps its state color.
			iconElement.style.setProperty('color', asCssVariable(icon.color.id), 'important');
		}
		return iconElement;
	}

	protected override getLabelText(): string {
		return this.isSummarized
			? this._pillOptions.summaryLabel(this.entries.length)
			: this.entries.at(0)?.label ?? '';
	}

	protected override getAdditionalLabelContent(): Array<HTMLElement | string> {
		return this.isSummarized ? [$(`span.chat-pill-chevron${ThemeIcon.asCSSSelector(Codicon.chevronDownCompact)}`, { 'aria-hidden': 'true' })] : [];
	}

	protected override getTooltip(): string {
		if (this.isSummarized) {
			return this._pillOptions.summaryAriaLabel(this.entries.length);
		}
		const entry = this.entries.at(0);
		return entry?.tooltip ?? entry?.label ?? this._pillOptions.title;
	}

	protected override getAriaLabel(): string | undefined {
		return this.isSummarized
			? this._pillOptions.summaryAriaLabel(this.entries.length)
			: this.entries.at(0)?.ariaLabel ?? super.getAriaLabel();
	}

	protected override onDidClickButton(): void {
		if (!this.isSummarized) {
			this.openEntry(this.entries.at(0));
			return;
		}
		// The action widget's own body handler already dismissed the dropdown by
		// the time this runs, so reopening here would make the trigger unable to
		// close it. `hasOpenDropdown` suppresses that second open.
		this.showDropdown();
	}

	protected override hasOpenDropdown(): boolean {
		return this._dropdownVisible;
	}

	protected openEntry(entry: IChatPillEntry | undefined): void {
		try {
			entry?.open();
		} catch (error) {
			onUnexpectedError(error);
		}
	}

	protected showDropdown(): void {
		const sections = this._sections.get().filter(section => section.entries.length > 0);
		const trigger = this.button?.element;
		if (!trigger || this._actionWidgetService.isVisible || sections.length === 0) {
			return;
		}

		const items: IActionListItem<IChatPillEntry>[] = [];
		for (const section of sections) {
			if (items.length > 0) {
				items.push({ kind: ActionListItemKind.Separator, label: '' });
			}
			items.push({ kind: ActionListItemKind.Header, label: section.title, group: { title: section.title } });
			for (const entry of section.entries) {
				items.push({
					kind: ActionListItemKind.Action,
					label: entry.label,
					group: { title: '', ...(entry.icon ? { icon: entry.icon } : {}) },
					...(entry.resource ? { iconClasses: getIconClasses(this._modelService, this._languageService, entry.resource, FileKind.FILE) } : {}),
					...(entry.toolbarActions?.length ? { toolbarActions: [...entry.toolbarActions] } : {}),
					ariaDescription: entry.ariaDescription,
					hover: entry.hover,
					item: entry,
				});
			}
		}

		const delegate: IActionListDelegate<IChatPillEntry> = {
			onSelect: entry => {
				this._actionWidgetService.hide();
				this.openEntry(entry);
			},
			onHide: () => {
				this._dropdownVisible = false;
				this._updatePopupState();
				trigger.focus();
			},
		};
		this._dropdownVisible = true;
		this._updatePopupState();
		this._actionWidgetService.show(
			this._pillOptions.widgetId,
			false,
			items,
			delegate,
			trigger,
			undefined,
			[],
			{
				getAriaLabel: item => item.label ?? '',
				getWidgetAriaLabel: () => this._pillOptions.title,
			},
			{ minWidth: 240, maxWidth: 460, widgetClassName: 'show-file-icons' },
		);
	}
}

/**
 * Builds the pill for a set of sections, choosing the rendering that fits the
 * data: a lone resource entry renders as a resource pill, everything else as
 * the dropdown pill (which itself collapses to `icon + label` for one entry,
 * unless its {@link IChatDropdownPillOptions.singleEntry} policy says otherwise).
 *
 * The descriptor identity only changes when the rendering has to change, so the
 * toolbar rebuilds the view item on a shape flip and updates in place otherwise.
 */
export function createChatSectionPill(
	action: IAction,
	sections: IObservable<readonly IChatPillSection[]>,
	options: IChatDropdownPillOptions,
	resourceLabels: ResourceLabels,
	instantiationService: IInstantiationService,
): IObservable<IChatPill> {
	const singleResourceEntry = derived<IChatPillEntry | undefined>(reader => {
		const entry = getInlineEntry(getChatPillEntries(sections.read(reader)), options);
		return entry?.resource ? entry : undefined;
	});
	const isResource = derived(reader => !!singleResourceEntry.read(reader));

	return derived<IChatPill>(reader => isResource.read(reader)
		? { action, createActionViewItem: viewItemOptions => new ChatResourcePillActionViewItem(action, viewItemOptions, singleResourceEntry, resourceLabels) }
		: { action, createActionViewItem: viewItemOptions => instantiationService.createInstance(ChatDropdownPillActionViewItem, action, viewItemOptions, sections, options) });
}
