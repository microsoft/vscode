/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as types from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { ITree, IActionProvider } from 'vs/base/parts/tree/browser/tree';
import { IconLabel, IIconLabelValueOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IQuickNavigateConfiguration, IModel, IDataSource, IFilter, IAccessiblityProvider, IRenderer, IRunner, Mode, IEntryRunContext } from 'vs/base/parts/quickopen/common/quickOpen';
import { IAction, IActionRunner } from 'vs/base/common/actions';
import { compareAnything } from 'vs/base/common/comparers';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { HighlightedLabel } from 'vs/base/browser/ui/highlightedlabel/highlightedLabel';
import * as DOM from 'vs/base/browser/dom';
import { IQuickOpenStyles } from 'vs/base/parts/quickopen/browser/quickOpenWidget';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { OS } from 'vs/base/common/platform';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IItemAccessor } from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { coalesce } from 'vs/base/common/arrays';

export interface IContext {
	event: any;
	quickNavigateConfiguration: IQuickNavigateConfiguration;
}

export interface IHighlight {
	start: number;
	end: number;
}

let IDS = 0;

export class QuickOpenItemAccessorClass implements IItemAccessor<QuickOpenEntry> {

	getItemLabel(entry: QuickOpenEntry): string | null {
		return types.withUndefinedAsNull(entry.getLabel());
	}

	getItemDescription(entry: QuickOpenEntry): string | null {
		return types.withUndefinedAsNull(entry.getDescription());
	}

	getItemPath(entry: QuickOpenEntry): string | undefined {
		const resource = entry.getResource();

		return resource ? resource.fsPath : undefined;
	}
}

export const QuickOpenItemAccessor = new QuickOpenItemAccessorClass();

export class QuickOpenEntry {
	private id: string;
	private labelHighlights: IHighlight[];
	private descriptionHighlights?: IHighlight[];
	private detailHighlights?: IHighlight[];
	private hidden: boolean | undefined;

	constructor(highlights: IHighlight[] = []) {
		this.id = (IDS++).toString();
		this.labelHighlights = highlights;
		this.descriptionHighlights = [];
	}

	/**
	 * A unique identifier for the entry
	 */
	getId(): string {
		return this.id;
	}

	/**
	 * The label of the entry to identify it from others in the list
	 */
	getLabel(): string | undefined {
		return undefined;
	}

	/**
	 * The options for the label to use for this entry
	 */
	getLabelOptions(): IIconLabelValueOptions | undefined {
		return undefined;
	}

	/**
	 * The label of the entry to use when a screen reader wants to read about the entry
	 */
	getAriaLabel(): string {
		return coalesce([this.getLabel(), this.getDescription(), this.getDetail()])
			.join(', ');
	}

	/**
	 * Detail information about the entry that is optional and can be shown below the label
	 */
	getDetail(): string | undefined {
		return undefined;
	}

	/**
	 * The icon of the entry to identify it from others in the list
	 */
	getIcon(): string | undefined {
		return undefined;
	}

	/**
	 * A secondary description that is optional and can be shown right to the label
	 */
	getDescription(): string | undefined {
		return undefined;
	}

	/**
	 * A tooltip to show when hovering over the entry.
	 */
	getTooltip(): string | undefined {
		return undefined;
	}

	/**
	 * A tooltip to show when hovering over the description portion of the entry.
	 */
	getDescriptionTooltip(): string | undefined {
		return undefined;
	}

	/**
	 * An optional keybinding to show for an entry.
	 */
	getKeybinding(): ResolvedKeybinding | undefined {
		return undefined;
	}

	/**
	 * A resource for this entry. Resource URIs can be used to compare different kinds of entries and group
	 * them together.
	 */
	getResource(): URI | undefined {
		return undefined;
	}

	/**
	 * Allows to reuse the same model while filtering. Hidden entries will not show up in the viewer.
	 */
	isHidden(): boolean {
		return !!this.hidden;
	}

	/**
	 * Allows to reuse the same model while filtering. Hidden entries will not show up in the viewer.
	 */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/**
	 * Allows to set highlight ranges that should show up for the entry label and optionally description if set.
	 */
	setHighlights(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[], detailHighlights?: IHighlight[]): void {
		this.labelHighlights = labelHighlights;
		this.descriptionHighlights = descriptionHighlights;
		this.detailHighlights = detailHighlights;
	}

	/**
	 * Allows to return highlight ranges that should show up for the entry label and description.
	 */
	getHighlights(): [IHighlight[] /* Label */, IHighlight[] | undefined /* Description */, IHighlight[] | undefined /* Detail */] {
		return [this.labelHighlights, this.descriptionHighlights, this.detailHighlights];
	}

	/**
	 * Called when the entry is selected for opening. Returns a boolean value indicating if an action was performed or not.
	 * The mode parameter gives an indication if the element is previewed (using arrow keys) or opened.
	 *
	 * The context parameter provides additional context information how the run was triggered.
	 */
	run(mode: Mode, context: IEntryRunContext): boolean {
		return false;
	}

	/**
	 * Determines if this quick open entry should merge with the editor history in quick open. If set to true
	 * and the resource of this entry is the same as the resource for an editor history, it will not show up
	 * because it is considered to be a duplicate of an editor history.
	 */
	mergeWithEditorHistory(): boolean {
		return false;
	}
}

export class QuickOpenEntryGroup extends QuickOpenEntry {
	private entry?: QuickOpenEntry;
	private groupLabel?: string;
	private withBorder?: boolean;

	constructor(entry?: QuickOpenEntry, groupLabel?: string, withBorder?: boolean) {
		super();

		this.entry = entry;
		this.groupLabel = groupLabel;
		this.withBorder = withBorder;
	}

	/**
	 * The label of the group or null if none.
	 */
	getGroupLabel(): string | undefined {
		return this.groupLabel;
	}

	setGroupLabel(groupLabel: string | undefined): void {
		this.groupLabel = groupLabel;
	}

	/**
	 * Whether to show a border on top of the group entry or not.
	 */
	showBorder(): boolean {
		return !!this.withBorder;
	}

	setShowBorder(showBorder: boolean): void {
		this.withBorder = showBorder;
	}

	getLabel(): string | undefined {
		return this.entry ? this.entry.getLabel() : super.getLabel();
	}

	getLabelOptions(): IIconLabelValueOptions | undefined {
		return this.entry ? this.entry.getLabelOptions() : super.getLabelOptions();
	}

	getAriaLabel(): string {
		return this.entry ? this.entry.getAriaLabel() : super.getAriaLabel();
	}

	getDetail(): string | undefined {
		return this.entry ? this.entry.getDetail() : super.getDetail();
	}

	getResource(): URI | undefined {
		return this.entry ? this.entry.getResource() : super.getResource();
	}

	getIcon(): string | undefined {
		return this.entry ? this.entry.getIcon() : super.getIcon();
	}

	getDescription(): string | undefined {
		return this.entry ? this.entry.getDescription() : super.getDescription();
	}

	getEntry(): QuickOpenEntry | undefined {
		return this.entry;
	}

	getHighlights(): [IHighlight[], IHighlight[] | undefined, IHighlight[] | undefined] {
		return this.entry ? this.entry.getHighlights() : super.getHighlights();
	}

	isHidden(): boolean {
		return this.entry ? this.entry.isHidden() : super.isHidden();
	}

	setHighlights(labelHighlights: IHighlight[], descriptionHighlights?: IHighlight[], detailHighlights?: IHighlight[]): void {
		this.entry ? this.entry.setHighlights(labelHighlights, descriptionHighlights, detailHighlights) : super.setHighlights(labelHighlights, descriptionHighlights, detailHighlights);
	}

	setHidden(hidden: boolean): void {
		this.entry ? this.entry.setHidden(hidden) : super.setHidden(hidden);
	}

	run(mode: Mode, context: IEntryRunContext): boolean {
		return this.entry ? this.entry.run(mode, context) : super.run(mode, context);
	}
}

class NoActionProvider implements IActionProvider {

	hasActions(tree: ITree, element: any): boolean {
		return false;
	}

	getActions(tree: ITree, element: any): IAction[] | null {
		return null;
	}
}

export interface IQuickOpenEntryTemplateData {
	container: HTMLElement;
	entry: HTMLElement;
	icon: HTMLSpanElement;
	label: IconLabel;
	detail: HighlightedLabel;
	keybinding: KeybindingLabel;
	actionBar: ActionBar;
}

export interface IQuickOpenEntryGroupTemplateData extends IQuickOpenEntryTemplateData {
	group?: HTMLDivElement;
}

const templateEntry = 'quickOpenEntry';
const templateEntryGroup = 'quickOpenEntryGroup';

class Renderer implements IRenderer<QuickOpenEntry> {

	private actionProvider: IActionProvider;
	private actionRunner?: IActionRunner;

	constructor(actionProvider: IActionProvider = new NoActionProvider(), actionRunner?: IActionRunner) {
		this.actionProvider = actionProvider;
		this.actionRunner = actionRunner;
	}

	getHeight(entry: QuickOpenEntry): number {
		if (entry.getDetail()) {
			return 44;
		}

		return 22;
	}

	getTemplateId(entry: QuickOpenEntry): string {
		if (entry instanceof QuickOpenEntryGroup) {
			return templateEntryGroup;
		}

		return templateEntry;
	}

	renderTemplate(templateId: string, container: HTMLElement, styles: IQuickOpenStyles): IQuickOpenEntryGroupTemplateData {
		const entryContainer = document.createElement('div');
		DOM.addClass(entryContainer, 'sub-content');
		container.appendChild(entryContainer);

		// Entry
		const row1 = DOM.$('.quick-open-row');
		const row2 = DOM.$('.quick-open-row');
		const entry = DOM.$('.quick-open-entry', undefined, row1, row2);
		entryContainer.appendChild(entry);

		// Icon
		const icon = document.createElement('span');
		row1.appendChild(icon);

		// Label
		const label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportOcticons: true });

		// Keybinding
		const keybindingContainer = document.createElement('span');
		row1.appendChild(keybindingContainer);
		DOM.addClass(keybindingContainer, 'quick-open-entry-keybinding');
		const keybinding = new KeybindingLabel(keybindingContainer, OS);

		// Detail
		const detailContainer = document.createElement('div');
		row2.appendChild(detailContainer);
		DOM.addClass(detailContainer, 'quick-open-entry-meta');
		const detail = new HighlightedLabel(detailContainer, true);

		// Entry Group
		let group: HTMLDivElement | undefined;
		if (templateId === templateEntryGroup) {
			group = document.createElement('div');
			DOM.addClass(group, 'results-group');
			container.appendChild(group);
		}

		// Actions
		DOM.addClass(container, 'actions');

		const actionBarContainer = document.createElement('div');
		DOM.addClass(actionBarContainer, 'primary-action-bar');
		container.appendChild(actionBarContainer);

		const actionBar = new ActionBar(actionBarContainer, {
			actionRunner: this.actionRunner
		});

		return {
			container,
			entry,
			icon,
			label,
			detail,
			keybinding,
			group,
			actionBar
		};
	}

	renderElement(entry: QuickOpenEntry, templateId: string, data: IQuickOpenEntryGroupTemplateData, styles: IQuickOpenStyles): void {

		// Action Bar
		if (this.actionProvider.hasActions(null, entry)) {
			DOM.addClass(data.container, 'has-actions');
		} else {
			DOM.removeClass(data.container, 'has-actions');
		}

		data.actionBar.context = entry; // make sure the context is the current element

		const actions = this.actionProvider.getActions(null, entry);
		if (data.actionBar.isEmpty() && actions && actions.length > 0) {
			data.actionBar.push(actions, { icon: true, label: false });
		} else if (!data.actionBar.isEmpty() && (!actions || actions.length === 0)) {
			data.actionBar.clear();
		}

		// Entry group class
		if (entry instanceof QuickOpenEntryGroup && entry.getGroupLabel()) {
			DOM.addClass(data.container, 'has-group-label');
		} else {
			DOM.removeClass(data.container, 'has-group-label');
		}

		// Entry group
		if (entry instanceof QuickOpenEntryGroup) {
			const group = <QuickOpenEntryGroup>entry;
			const groupData = data;

			// Border
			if (group.showBorder()) {
				DOM.addClass(groupData.container, 'results-group-separator');
				if (styles.pickerGroupBorder) {
					groupData.container.style.borderTopColor = styles.pickerGroupBorder.toString();
				}
			} else {
				DOM.removeClass(groupData.container, 'results-group-separator');
				groupData.container.style.borderTopColor = null;
			}

			// Group Label
			const groupLabel = group.getGroupLabel() || '';
			if (groupData.group) {
				groupData.group.textContent = groupLabel;
				if (styles.pickerGroupForeground) {
					groupData.group.style.color = styles.pickerGroupForeground.toString();
				}
			}
		}

		// Normal Entry
		if (entry instanceof QuickOpenEntry) {
			const [labelHighlights, descriptionHighlights, detailHighlights] = entry.getHighlights();

			// Icon
			const iconClass = entry.getIcon() ? ('quick-open-entry-icon ' + entry.getIcon()) : '';
			data.icon.className = iconClass;

			// Label
			const options: IIconLabelValueOptions = entry.getLabelOptions() || Object.create(null);
			options.matches = labelHighlights || [];
			options.title = entry.getTooltip();
			options.descriptionTitle = entry.getDescriptionTooltip() || entry.getDescription(); // tooltip over description because it could overflow
			options.descriptionMatches = descriptionHighlights || [];
			data.label.setLabel(types.withNullAsUndefined(entry.getLabel()), entry.getDescription(), options);

			// Meta
			data.detail.set(entry.getDetail(), detailHighlights);

			// Keybinding
			data.keybinding.set(entry.getKeybinding()!);
		}
	}

	disposeTemplate(templateId: string, templateData: IQuickOpenEntryGroupTemplateData): void {
		templateData.actionBar.dispose();
		templateData.actionBar = null!;
		templateData.container = null!;
		templateData.entry = null!;
		templateData.keybinding = null!;
		templateData.detail = null!;
		templateData.group = null!;
		templateData.icon = null!;
		templateData.label.dispose();
		templateData.label = null!;
	}
}

export class QuickOpenModel implements
	IModel<QuickOpenEntry>,
	IDataSource<QuickOpenEntry>,
	IFilter<QuickOpenEntry>,
	IRunner<QuickOpenEntry>,
	IAccessiblityProvider<QuickOpenEntry>
{
	private _entries: QuickOpenEntry[];
	private _dataSource: IDataSource<QuickOpenEntry>;
	private _renderer: IRenderer<QuickOpenEntry>;
	private _filter: IFilter<QuickOpenEntry>;
	private _runner: IRunner<QuickOpenEntry>;
	private _accessibilityProvider: IAccessiblityProvider<QuickOpenEntry>;

	constructor(entries: QuickOpenEntry[] = [], actionProvider: IActionProvider = new NoActionProvider()) {
		this._entries = entries;
		this._dataSource = this;
		this._renderer = new Renderer(actionProvider);
		this._filter = this;
		this._runner = this;
		this._accessibilityProvider = this;
	}

	get entries() { return this._entries; }
	get dataSource() { return this._dataSource; }
	get renderer() { return this._renderer; }
	get filter() { return this._filter; }
	get runner() { return this._runner; }
	get accessibilityProvider() { return this._accessibilityProvider; }

	set entries(entries: QuickOpenEntry[]) {
		this._entries = entries;
	}

	/**
	 * Adds entries that should show up in the quick open viewer.
	 */
	addEntries(entries: QuickOpenEntry[]): void {
		if (types.isArray(entries)) {
			this._entries = this._entries.concat(entries);
		}
	}

	/**
	 * Set the entries that should show up in the quick open viewer.
	 */
	setEntries(entries: QuickOpenEntry[]): void {
		if (types.isArray(entries)) {
			this._entries = entries;
		}
	}

	/**
	 * Get the entries that should show up in the quick open viewer.
	 *
	 * @visibleOnly optional parameter to only return visible entries
	 */
	getEntries(visibleOnly?: boolean): QuickOpenEntry[] {
		if (visibleOnly) {
			return this._entries.filter((e) => !e.isHidden());
		}

		return this._entries;
	}

	getId(entry: QuickOpenEntry): string {
		return entry.getId();
	}

	getLabel(entry: QuickOpenEntry): string | null {
		return types.withUndefinedAsNull(entry.getLabel());
	}

	getAriaLabel(entry: QuickOpenEntry): string {
		const ariaLabel = entry.getAriaLabel();
		if (ariaLabel) {
			return nls.localize('quickOpenAriaLabelEntry', "{0}, picker", entry.getAriaLabel());
		}

		return nls.localize('quickOpenAriaLabel', "picker");
	}

	isVisible(entry: QuickOpenEntry): boolean {
		return !entry.isHidden();
	}

	run(entry: QuickOpenEntry, mode: Mode, context: IEntryRunContext): boolean {
		return entry.run(mode, context);
	}
}

/**
 * A good default sort implementation for quick open entries respecting highlight information
 * as well as associated resources.
 */
export function compareEntries(elementA: QuickOpenEntry, elementB: QuickOpenEntry, lookFor: string): number {

	// Give matches with label highlights higher priority over
	// those with only description highlights
	const labelHighlightsA = elementA.getHighlights()[0] || [];
	const labelHighlightsB = elementB.getHighlights()[0] || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	// Fallback to the full path if labels are identical and we have associated resources
	let nameA = elementA.getLabel()!;
	let nameB = elementB.getLabel()!;
	if (nameA === nameB) {
		const resourceA = elementA.getResource();
		const resourceB = elementB.getResource();

		if (resourceA && resourceB) {
			nameA = resourceA.fsPath;
			nameB = resourceB.fsPath;
		}
	}

	return compareAnything(nameA, nameB, lookFor);
}
