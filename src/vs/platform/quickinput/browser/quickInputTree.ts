/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../base/browser/dom.js';
import { Emitter, Event, EventBufferer, IValueWithChangeEvent } from '../../../base/common/event.js';
import { IHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate.js';
import { IListVirtualDelegate } from '../../../base/browser/ui/list/list.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer, TreeVisibility } from '../../../base/browser/ui/tree/tree.js';
import { localize } from '../../../nls.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { WorkbenchObjectTree } from '../../list/browser/listService.js';
import { IThemeService } from '../../theme/common/themeService.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickPickSeparatorButtonEvent, QuickPickItem, QuickPickFocus } from '../common/quickInput.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { IMatch } from '../../../base/common/filters.js';
import { IListAccessibilityProvider, IListStyles } from '../../../base/browser/ui/list/listWidget.js';
import { AriaRole } from '../../../base/browser/ui/aria/aria.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../base/common/keyCodes.js';
import { OS } from '../../../base/common/platform.js';
import { memoize } from '../../../base/common/decorators.js';
import { IIconLabelValueOptions, IconLabel } from '../../../base/browser/ui/iconLabel/iconLabel.js';
import { KeybindingLabel } from '../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { isDark } from '../../theme/common/theme.js';
import { URI } from '../../../base/common/uri.js';
import { quickInputButtonToAction } from './quickInputUtils.js';
import { Lazy } from '../../../base/common/lazy.js';
import { IParsedLabelWithIcons, getCodiconAriaLabel, matchesFuzzyIconAware, parseLabelWithIcons } from '../../../base/common/iconLabels.js';
import { HoverPosition } from '../../../base/browser/ui/hover/hoverWidget.js';
import { compareAnything } from '../../../base/common/comparers.js';
import { ltrim } from '../../../base/common/strings.js';
import { RenderIndentGuides } from '../../../base/browser/ui/tree/abstractTree.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import { isCancellationError } from '../../../base/common/errors.js';
import type { IHoverWidget, IManagedHoverTooltipMarkdownString } from '../../../base/browser/ui/hover/hover.js';
import { IAccessibilityService } from '../../accessibility/common/accessibility.js';
import { observableValue, observableValueOpts, transaction } from '../../../base/common/observable.js';
import { equals } from '../../../base/common/arrays.js';

const $ = dom.$;

interface IQuickInputItemLazyParts {
	readonly saneLabel: string;
	readonly saneSortLabel: string;
	readonly saneAriaLabel: string;
}

interface IQuickPickElement extends IQuickInputItemLazyParts {
	readonly hasCheckbox: boolean;
	readonly index: number;
	readonly item?: IQuickPickItem;
	readonly saneDescription?: string;
	readonly saneDetail?: string;
	readonly saneTooltip?: string | IMarkdownString | HTMLElement;
	hidden: boolean;
	element?: HTMLElement;
	labelHighlights?: IMatch[];
	descriptionHighlights?: IMatch[];
	detailHighlights?: IMatch[];
	separator?: IQuickPickSeparator;
}

interface IQuickInputItemTemplateData {
	entry: HTMLDivElement;
	checkbox: HTMLInputElement;
	icon: HTMLDivElement;
	label: IconLabel;
	keybinding: KeybindingLabel;
	detail: IconLabel;
	separator: HTMLDivElement;
	actionBar: ActionBar;
	element: IQuickPickElement;
	toDisposeElement: DisposableStore;
	toDisposeTemplate: DisposableStore;
}

class BaseQuickPickItemElement implements IQuickPickElement {
	private readonly _init: Lazy<IQuickInputItemLazyParts>;

	constructor(
		readonly index: number,
		readonly hasCheckbox: boolean,
		mainItem: QuickPickItem
	) {
		this._init = new Lazy(() => {
			const saneLabel = mainItem.label ?? '';
			const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();

			const saneAriaLabel = mainItem.ariaLabel || [saneLabel, this.saneDescription, this.saneDetail]
				.map(s => getCodiconAriaLabel(s))
				.filter(s => !!s)
				.join(', ');

			return {
				saneLabel,
				saneSortLabel,
				saneAriaLabel
			};
		});
		this._saneDescription = mainItem.description;
		this._saneTooltip = mainItem.tooltip;
	}

	// #region Lazy Getters

	get saneLabel() {
		return this._init.value.saneLabel;
	}
	get saneSortLabel() {
		return this._init.value.saneSortLabel;
	}
	get saneAriaLabel() {
		return this._init.value.saneAriaLabel;
	}

	// #endregion

	// #region Getters and Setters

	private _element?: HTMLElement;
	get element() {
		return this._element;
	}
	set element(value: HTMLElement | undefined) {
		this._element = value;
	}

	private _hidden = false;
	get hidden() {
		return this._hidden;
	}
	set hidden(value: boolean) {
		this._hidden = value;
	}

	private _saneDescription?: string;
	get saneDescription() {
		return this._saneDescription;
	}
	set saneDescription(value: string | undefined) {
		this._saneDescription = value;
	}

	protected _saneDetail?: string;
	get saneDetail() {
		return this._saneDetail;
	}
	set saneDetail(value: string | undefined) {
		this._saneDetail = value;
	}

	private _saneTooltip?: string | IMarkdownString | HTMLElement;
	get saneTooltip() {
		return this._saneTooltip;
	}
	set saneTooltip(value: string | IMarkdownString | HTMLElement | undefined) {
		this._saneTooltip = value;
	}

	protected _labelHighlights?: IMatch[];
	get labelHighlights() {
		return this._labelHighlights;
	}
	set labelHighlights(value: IMatch[] | undefined) {
		this._labelHighlights = value;
	}

	protected _descriptionHighlights?: IMatch[];
	get descriptionHighlights() {
		return this._descriptionHighlights;
	}
	set descriptionHighlights(value: IMatch[] | undefined) {
		this._descriptionHighlights = value;
	}

	protected _detailHighlights?: IMatch[];
	get detailHighlights() {
		return this._detailHighlights;
	}
	set detailHighlights(value: IMatch[] | undefined) {
		this._detailHighlights = value;
	}
}

class QuickPickItemElement extends BaseQuickPickItemElement {
	readonly onChecked: Event<boolean>;

	constructor(
		index: number,
		hasCheckbox: boolean,
		readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void,
		private _onChecked: Emitter<{ element: IQuickPickElement; checked: boolean }>,
		readonly item: IQuickPickItem,
		private _separator: IQuickPickSeparator | undefined,
	) {
		super(index, hasCheckbox, item);

		this.onChecked = hasCheckbox
			? Event.map(Event.filter<{ element: IQuickPickElement; checked: boolean }>(this._onChecked.event, e => e.element === this), e => e.checked)
			: Event.None;

		this._saneDetail = item.detail;
		this._labelHighlights = item.highlights?.label;
		this._descriptionHighlights = item.highlights?.description;
		this._detailHighlights = item.highlights?.detail;
	}

	get separator() {
		return this._separator;
	}
	set separator(value: IQuickPickSeparator | undefined) {
		this._separator = value;
	}

	private _checked = false;
	get checked() {
		return this._checked;
	}
	set checked(value: boolean) {
		if (value !== this._checked) {
			this._checked = value;
			this._onChecked.fire({ element: this, checked: value });
		}
	}

	get checkboxDisabled() {
		return !!this.item.disabled;
	}
}

enum QuickPickSeparatorFocusReason {
	/**
	 * No item is hovered or active
	 */
	NONE = 0,
	/**
	 * Some item within this section is hovered
	 */
	MOUSE_HOVER = 1,
	/**
	 * Some item within this section is active
	 */
	ACTIVE_ITEM = 2
}

class QuickPickSeparatorElement extends BaseQuickPickItemElement {
	children = new Array<QuickPickItemElement>();
	/**
	 * If this item is >0, it means that there is some item in the list that is either:
	 * * hovered over
	 * * active
	 */
	focusInsideSeparator = QuickPickSeparatorFocusReason.NONE;

	constructor(
		index: number,
		readonly fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void,
		readonly separator: IQuickPickSeparator,
	) {
		super(index, false, separator);
	}
}

class QuickInputItemDelegate implements IListVirtualDelegate<IQuickPickElement> {
	getHeight(element: IQuickPickElement): number {

		if (element instanceof QuickPickSeparatorElement) {
			return 30;
		}
		return element.saneDetail ? 44 : 22;
	}

	getTemplateId(element: IQuickPickElement): string {
		if (element instanceof QuickPickItemElement) {
			return QuickPickItemElementRenderer.ID;
		} else {
			return QuickPickSeparatorElementRenderer.ID;
		}
	}
}

class QuickInputAccessibilityProvider implements IListAccessibilityProvider<IQuickPickElement> {

	getWidgetAriaLabel(): string {
		return localize('quickInput', "Quick Input");
	}

	getAriaLabel(element: IQuickPickElement): string | null {
		return element.separator?.label
			? `${element.saneAriaLabel}, ${element.separator.label}`
			: element.saneAriaLabel;
	}

	getWidgetRole(): AriaRole {
		return 'listbox';
	}

	getRole(element: IQuickPickElement) {
		return element.hasCheckbox ? 'checkbox' : 'option';
	}

	isChecked(element: IQuickPickElement): IValueWithChangeEvent<boolean> | undefined {
		if (!element.hasCheckbox || !(element instanceof QuickPickItemElement)) {
			return undefined;
		}

		return {
			get value() { return element.checked; },
			onDidChange: e => element.onChecked(() => e()),
		};
	}
}

abstract class BaseQuickInputListRenderer<T extends IQuickPickElement> implements ITreeRenderer<T, void, IQuickInputItemTemplateData> {
	abstract templateId: string;

	constructor(
		private readonly hoverDelegate: IHoverDelegate | undefined
	) { }

	// TODO: only do the common stuff here and have a subclass handle their specific stuff
	renderTemplate(container: HTMLElement): IQuickInputItemTemplateData {
		const data: IQuickInputItemTemplateData = Object.create(null);
		data.toDisposeElement = new DisposableStore();
		data.toDisposeTemplate = new DisposableStore();
		data.entry = dom.append(container, $('.quick-input-list-entry'));

		// Checkbox
		const label = dom.append(data.entry, $('label.quick-input-list-label'));
		data.toDisposeTemplate.add(dom.addStandardDisposableListener(label, dom.EventType.CLICK, e => {
			if (!data.checkbox.offsetParent) { // If checkbox not visible:
				e.preventDefault(); // Prevent toggle of checkbox when it is immediately shown afterwards. #91740
			}
		}));
		data.checkbox = <HTMLInputElement>dom.append(label, $('input.quick-input-list-checkbox'));
		data.checkbox.type = 'checkbox';

		// Rows
		const rows = dom.append(label, $('.quick-input-list-rows'));
		const row1 = dom.append(rows, $('.quick-input-list-row'));
		const row2 = dom.append(rows, $('.quick-input-list-row'));

		// Label
		data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
		data.toDisposeTemplate.add(data.label);
		data.icon = <HTMLInputElement>dom.prepend(data.label.element, $('.quick-input-list-icon'));

		// Keybinding
		const keybindingContainer = dom.append(row1, $('.quick-input-list-entry-keybinding'));
		data.keybinding = new KeybindingLabel(keybindingContainer, OS);
		data.toDisposeTemplate.add(data.keybinding);

		// Detail
		const detailContainer = dom.append(row2, $('.quick-input-list-label-meta'));
		data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
		data.toDisposeTemplate.add(data.detail);

		// Separator
		data.separator = dom.append(data.entry, $('.quick-input-list-separator'));

		// Actions
		data.actionBar = new ActionBar(data.entry, this.hoverDelegate ? { hoverDelegate: this.hoverDelegate } : undefined);
		data.actionBar.domNode.classList.add('quick-input-list-entry-action-bar');
		data.toDisposeTemplate.add(data.actionBar);

		return data;
	}

	disposeTemplate(data: IQuickInputItemTemplateData): void {
		data.toDisposeElement.dispose();
		data.toDisposeTemplate.dispose();
	}

	disposeElement(_element: ITreeNode<IQuickPickElement, void>, _index: number, data: IQuickInputItemTemplateData): void {
		data.toDisposeElement.clear();
		data.actionBar.clear();
	}

	// TODO: only do the common stuff here and have a subclass handle their specific stuff
	abstract renderElement(node: ITreeNode<IQuickPickElement, void>, index: number, data: IQuickInputItemTemplateData): void;
}

class QuickPickItemElementRenderer extends BaseQuickInputListRenderer<QuickPickItemElement> {
	static readonly ID = 'quickpickitem';

	// Follow what we do in the separator renderer
	private readonly _itemsWithSeparatorsFrequency = new Map<QuickPickItemElement, number>();

	constructor(
		hoverDelegate: IHoverDelegate | undefined,
		@IThemeService private readonly themeService: IThemeService,
	) {
		super(hoverDelegate);
	}

	get templateId() {
		return QuickPickItemElementRenderer.ID;
	}

	override renderTemplate(container: HTMLElement): IQuickInputItemTemplateData {
		const data = super.renderTemplate(container);

		data.toDisposeTemplate.add(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			(data.element as QuickPickItemElement).checked = data.checkbox.checked;
		}));

		return data;
	}

	renderElement(node: ITreeNode<QuickPickItemElement, void>, index: number, data: IQuickInputItemTemplateData): void {
		const element = node.element;
		data.element = element;
		element.element = data.entry ?? undefined;
		const mainItem: IQuickPickItem = element.item;

		data.checkbox.checked = element.checked;
		data.toDisposeElement.add(element.onChecked(checked => data.checkbox.checked = checked));
		data.checkbox.disabled = element.checkboxDisabled;

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		// Icon
		if (mainItem.iconPath) {
			const icon = isDark(this.themeService.getColorTheme().type) ? mainItem.iconPath.dark : (mainItem.iconPath.light ?? mainItem.iconPath.dark);
			const iconUrl = URI.revive(icon);
			data.icon.className = 'quick-input-list-icon';
			data.icon.style.backgroundImage = dom.asCSSUrl(iconUrl);
		} else {
			data.icon.style.backgroundImage = '';
			data.icon.className = mainItem.iconClass ? `quick-input-list-icon ${mainItem.iconClass}` : '';
		}

		// Label
		let descriptionTitle: IManagedHoverTooltipMarkdownString | undefined;
		// if we have a tooltip, that will be the hover,
		// with the saneDescription as fallback if it
		// is defined
		if (!element.saneTooltip && element.saneDescription) {
			descriptionTitle = {
				markdown: {
					value: element.saneDescription,
					supportThemeIcons: true
				},
				markdownNotSupportedFallback: element.saneDescription
			};
		}
		const options: IIconLabelValueOptions = {
			matches: labelHighlights || [],
			// If we have a tooltip, we want that to be shown and not any other hover
			descriptionTitle,
			descriptionMatches: descriptionHighlights || [],
			labelEscapeNewLines: true
		};
		options.extraClasses = mainItem.iconClasses;
		options.italic = mainItem.italic;
		options.strikethrough = mainItem.strikethrough;
		data.entry.classList.remove('quick-input-list-separator-as-item');
		data.label.setLabel(element.saneLabel, element.saneDescription, options);

		// Keybinding
		data.keybinding.set(mainItem.keybinding);

		// Detail
		if (element.saneDetail) {
			let title: IManagedHoverTooltipMarkdownString | undefined;
			// If we have a tooltip, we want that to be shown and not any other hover
			if (!element.saneTooltip) {
				title = {
					markdown: {
						value: element.saneDetail,
						supportThemeIcons: true
					},
					markdownNotSupportedFallback: element.saneDetail
				};
			}
			data.detail.element.style.display = '';
			data.detail.setLabel(element.saneDetail, undefined, {
				matches: detailHighlights,
				title,
				labelEscapeNewLines: true
			});
		} else {
			data.detail.element.style.display = 'none';
		}

		// Separator
		if (element.separator?.label) {
			data.separator.textContent = element.separator.label;
			data.separator.style.display = '';
			this.addItemWithSeparator(element);
		} else {
			data.separator.style.display = 'none';
		}
		data.entry.classList.toggle('quick-input-list-separator-border', !!element.separator);

		// Actions
		const buttons = mainItem.buttons;
		if (buttons && buttons.length) {
			data.actionBar.push(buttons.map((button, index) => quickInputButtonToAction(
				button,
				`id-${index}`,
				() => element.fireButtonTriggered({ button, item: element.item })
			)), { icon: true, label: false });
			data.entry.classList.add('has-actions');
		} else {
			data.entry.classList.remove('has-actions');
		}
	}

	override disposeElement(element: ITreeNode<QuickPickItemElement, void>, _index: number, data: IQuickInputItemTemplateData): void {
		this.removeItemWithSeparator(element.element);
		super.disposeElement(element, _index, data);
	}

	isItemWithSeparatorVisible(item: QuickPickItemElement): boolean {
		return this._itemsWithSeparatorsFrequency.has(item);
	}

	private addItemWithSeparator(item: QuickPickItemElement): void {
		this._itemsWithSeparatorsFrequency.set(item, (this._itemsWithSeparatorsFrequency.get(item) || 0) + 1);
	}

	private removeItemWithSeparator(item: QuickPickItemElement): void {
		const frequency = this._itemsWithSeparatorsFrequency.get(item) || 0;
		if (frequency > 1) {
			this._itemsWithSeparatorsFrequency.set(item, frequency - 1);
		} else {
			this._itemsWithSeparatorsFrequency.delete(item);
		}
	}
}

class QuickPickSeparatorElementRenderer extends BaseQuickInputListRenderer<QuickPickSeparatorElement> {
	static readonly ID = 'quickpickseparator';

	// This is a frequency map because sticky scroll re-uses the same renderer to render a second
	// instance of the same separator.
	private readonly _visibleSeparatorsFrequency = new Map<QuickPickSeparatorElement, number>();

	get templateId() {
		return QuickPickSeparatorElementRenderer.ID;
	}

	get visibleSeparators(): QuickPickSeparatorElement[] {
		return [...this._visibleSeparatorsFrequency.keys()];
	}

	isSeparatorVisible(separator: QuickPickSeparatorElement): boolean {
		return this._visibleSeparatorsFrequency.has(separator);
	}

	override renderTemplate(container: HTMLElement): IQuickInputItemTemplateData {
		const data = super.renderTemplate(container);
		data.checkbox.style.display = 'none';
		return data;
	}

	override renderElement(node: ITreeNode<QuickPickSeparatorElement, void>, index: number, data: IQuickInputItemTemplateData): void {
		const element = node.element;
		data.element = element;
		element.element = data.entry ?? undefined;
		element.element.classList.toggle('focus-inside', !!element.focusInsideSeparator);
		const mainItem: IQuickPickSeparator = element.separator;

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		// Icon
		data.icon.style.backgroundImage = '';
		data.icon.className = '';

		// Label
		let descriptionTitle: IManagedHoverTooltipMarkdownString | undefined;
		// if we have a tooltip, that will be the hover,
		// with the saneDescription as fallback if it
		// is defined
		if (!element.saneTooltip && element.saneDescription) {
			descriptionTitle = {
				markdown: {
					value: element.saneDescription,
					supportThemeIcons: true
				},
				markdownNotSupportedFallback: element.saneDescription
			};
		}
		const options: IIconLabelValueOptions = {
			matches: labelHighlights || [],
			// If we have a tooltip, we want that to be shown and not any other hover
			descriptionTitle,
			descriptionMatches: descriptionHighlights || [],
			labelEscapeNewLines: true
		};
		data.entry.classList.add('quick-input-list-separator-as-item');
		data.label.setLabel(element.saneLabel, element.saneDescription, options);

		// Detail
		if (element.saneDetail) {
			let title: IManagedHoverTooltipMarkdownString | undefined;
			// If we have a tooltip, we want that to be shown and not any other hover
			if (!element.saneTooltip) {
				title = {
					markdown: {
						value: element.saneDetail,
						supportThemeIcons: true
					},
					markdownNotSupportedFallback: element.saneDetail
				};
			}
			data.detail.element.style.display = '';
			data.detail.setLabel(element.saneDetail, undefined, {
				matches: detailHighlights,
				title,
				labelEscapeNewLines: true
			});
		} else {
			data.detail.element.style.display = 'none';
		}

		// Separator
		data.separator.style.display = 'none';
		data.entry.classList.add('quick-input-list-separator-border');

		// Actions
		const buttons = mainItem.buttons;
		if (buttons && buttons.length) {
			data.actionBar.push(buttons.map((button, index) => quickInputButtonToAction(
				button,
				`id-${index}`,
				() => element.fireSeparatorButtonTriggered({ button, separator: element.separator })
			)), { icon: true, label: false });
			data.entry.classList.add('has-actions');
		} else {
			data.entry.classList.remove('has-actions');
		}

		this.addSeparator(element);
	}

	override disposeElement(element: ITreeNode<QuickPickSeparatorElement, void>, _index: number, data: IQuickInputItemTemplateData): void {
		this.removeSeparator(element.element);
		if (!this.isSeparatorVisible(element.element)) {
			element.element.element?.classList.remove('focus-inside');
		}
		super.disposeElement(element, _index, data);
	}

	private addSeparator(separator: QuickPickSeparatorElement): void {
		this._visibleSeparatorsFrequency.set(separator, (this._visibleSeparatorsFrequency.get(separator) || 0) + 1);
	}

	private removeSeparator(separator: QuickPickSeparatorElement): void {
		const frequency = this._visibleSeparatorsFrequency.get(separator) || 0;
		if (frequency > 1) {
			this._visibleSeparatorsFrequency.set(separator, frequency - 1);
		} else {
			this._visibleSeparatorsFrequency.delete(separator);
		}
	}
}

export class QuickInputTree extends Disposable {

	//#region QuickInputTree Events

	private readonly _onKeyDown = new Emitter<StandardKeyboardEvent>();
	/**
	 * Event that is fired when the tree receives a keydown.
	*/
	readonly onKeyDown: Event<StandardKeyboardEvent> = this._onKeyDown.event;

	private readonly _onLeave = new Emitter<void>();
	/**
	 * Event that is fired when the tree would no longer have focus.
	*/
	readonly onLeave: Event<void> = this._onLeave.event;

	private readonly _visibleCountObservable = observableValue('VisibleCount', 0);
	onChangedVisibleCount: Event<number> = Event.fromObservable(this._visibleCountObservable, this._store);

	private readonly _allVisibleCheckedObservable = observableValue('AllVisibleChecked', false);
	onChangedAllVisibleChecked: Event<boolean> = Event.fromObservable(this._allVisibleCheckedObservable, this._store);

	private readonly _checkedCountObservable = observableValue('CheckedCount', 0);
	onChangedCheckedCount: Event<number> = Event.fromObservable(this._checkedCountObservable, this._store);

	private readonly _checkedElementsObservable = observableValueOpts({ equalsFn: equals }, new Array<IQuickPickItem>());
	onChangedCheckedElements: Event<IQuickPickItem[]> = Event.fromObservable(this._checkedElementsObservable, this._store);

	private readonly _onButtonTriggered = new Emitter<IQuickPickItemButtonEvent<IQuickPickItem>>();
	onButtonTriggered = this._onButtonTriggered.event;

	private readonly _onSeparatorButtonTriggered = new Emitter<IQuickPickSeparatorButtonEvent>();
	onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;

	private readonly _elementChecked = new Emitter<{ element: IQuickPickElement; checked: boolean }>();
	private readonly _elementCheckedEventBufferer = new EventBufferer();

	//#endregion

	private _hasCheckboxes = false;

	private readonly _container: HTMLElement;
	private readonly _tree: WorkbenchObjectTree<IQuickPickElement, void>;
	private readonly _separatorRenderer: QuickPickSeparatorElementRenderer;
	private readonly _itemRenderer: QuickPickItemElementRenderer;
	private _inputElements = new Array<QuickPickItem>();
	private _elementTree = new Array<IQuickPickElement>();
	private _itemElements = new Array<QuickPickItemElement>();
	// Elements that apply to the current set of elements
	private readonly _elementDisposable = this._register(new DisposableStore());
	private _lastHover: IHoverWidget | undefined;
	private _lastQueryString: string | undefined;

	constructor(
		private parent: HTMLElement,
		private hoverDelegate: IHoverDelegate,
		private linkOpenerDelegate: (content: string) => void,
		id: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService
	) {
		super();
		this._container = dom.append(this.parent, $('.quick-input-list'));
		this._separatorRenderer = new QuickPickSeparatorElementRenderer(hoverDelegate);
		this._itemRenderer = instantiationService.createInstance(QuickPickItemElementRenderer, hoverDelegate);
		this._tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<IQuickPickElement, void>,
			'QuickInput',
			this._container,
			new QuickInputItemDelegate(),
			[this._itemRenderer, this._separatorRenderer],
			{
				filter: {
					filter(element) {
						return element.hidden
							? TreeVisibility.Hidden
							: element instanceof QuickPickSeparatorElement
								? TreeVisibility.Recurse
								: TreeVisibility.Visible;
					},
				},
				sorter: {
					compare: (element, otherElement) => {
						if (!this.sortByLabel || !this._lastQueryString) {
							return 0;
						}
						const normalizedSearchValue = this._lastQueryString.toLowerCase();
						return compareEntries(element, otherElement, normalizedSearchValue);
					},
				},
				accessibilityProvider: new QuickInputAccessibilityProvider(),
				setRowLineHeight: false,
				multipleSelectionSupport: false,
				hideTwistiesOfChildlessElements: true,
				renderIndentGuides: RenderIndentGuides.None,
				findWidgetEnabled: false,
				indent: 0,
				horizontalScrolling: false,
				allowNonCollapsibleParents: true,
				alwaysConsumeMouseWheel: true
			}
		));
		this._tree.getHTMLElement().id = id;
		this._registerListeners();
	}

	//#region public getters/setters

	@memoize
	get onDidChangeFocus() {
		return Event.map(
			this._tree.onDidChangeFocus,
			e => e.elements.filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement).map(e => e.item),
			this._store
		);
	}

	@memoize
	get onDidChangeSelection() {
		return Event.map(
			this._tree.onDidChangeSelection,
			e => ({
				items: e.elements.filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement).map(e => e.item),
				event: e.browserEvent
			}),
			this._store
		);
	}

	get displayed() {
		return this._container.style.display !== 'none';
	}

	set displayed(value: boolean) {
		this._container.style.display = value ? '' : 'none';
	}

	get scrollTop() {
		return this._tree.scrollTop;
	}

	set scrollTop(scrollTop: number) {
		this._tree.scrollTop = scrollTop;
	}

	get ariaLabel() {
		return this._tree.ariaLabel;
	}

	set ariaLabel(label: string | null) {
		this._tree.ariaLabel = label ?? '';
	}

	set enabled(value: boolean) {
		this._tree.getHTMLElement().style.pointerEvents = value ? '' : 'none';
	}

	private _matchOnDescription = false;
	get matchOnDescription() {
		return this._matchOnDescription;
	}
	set matchOnDescription(value: boolean) {
		this._matchOnDescription = value;
	}

	private _matchOnDetail = false;
	get matchOnDetail() {
		return this._matchOnDetail;
	}
	set matchOnDetail(value: boolean) {
		this._matchOnDetail = value;
	}

	private _matchOnLabel = true;
	get matchOnLabel() {
		return this._matchOnLabel;
	}
	set matchOnLabel(value: boolean) {
		this._matchOnLabel = value;
	}

	private _matchOnLabelMode: 'fuzzy' | 'contiguous' = 'fuzzy';
	get matchOnLabelMode() {
		return this._matchOnLabelMode;
	}
	set matchOnLabelMode(value: 'fuzzy' | 'contiguous') {
		this._matchOnLabelMode = value;
	}

	private _matchOnMeta = true;
	get matchOnMeta() {
		return this._matchOnMeta;
	}
	set matchOnMeta(value: boolean) {
		this._matchOnMeta = value;
	}

	private _sortByLabel = true;
	get sortByLabel() {
		return this._sortByLabel;
	}
	set sortByLabel(value: boolean) {
		this._sortByLabel = value;
	}

	private _shouldLoop = true;
	get shouldLoop() {
		return this._shouldLoop;
	}
	set shouldLoop(value: boolean) {
		this._shouldLoop = value;
	}

	//#endregion

	//#region register listeners

	private _registerListeners() {
		this._registerOnKeyDown();
		this._registerOnContainerClick();
		this._registerOnMouseMiddleClick();
		this._registerOnTreeModelChanged();
		this._registerOnElementChecked();
		this._registerOnContextMenu();
		this._registerHoverListeners();
		this._registerSelectionChangeListener();
		this._registerSeparatorActionShowingListeners();
	}

	private _registerOnKeyDown() {
		// TODO: Should this be added at a higher level?
		this._register(this._tree.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggleCheckbox();
					break;
			}

			this._onKeyDown.fire(event);
		}));
	}

	private _registerOnContainerClick() {
		this._register(dom.addDisposableListener(this._container, dom.EventType.CLICK, e => {
			if (e.x || e.y) { // Avoid 'click' triggered by 'space' on checkbox.
				this._onLeave.fire();
			}
		}));
	}

	private _registerOnMouseMiddleClick() {
		this._register(dom.addDisposableListener(this._container, dom.EventType.AUXCLICK, e => {
			if (e.button === 1) {
				this._onLeave.fire();
			}
		}));
	}

	private _registerOnTreeModelChanged() {
		this._register(this._tree.onDidChangeModel(() => {
			const visibleCount = this._itemElements.filter(e => !e.hidden).length;
			this._visibleCountObservable.set(visibleCount, undefined);
			if (this._hasCheckboxes) {
				this._updateCheckedObservables();
			}
		}));
	}

	private _registerOnElementChecked() {
		// Only fire the last event when buffered
		this._register(this._elementCheckedEventBufferer.wrapEvent(this._elementChecked.event, (_, e) => e)(_ => this._updateCheckedObservables()));
	}

	private _registerOnContextMenu() {
		this._register(this._tree.onContextMenu(e => {
			if (e.element) {
				e.browserEvent.preventDefault();

				// we want to treat a context menu event as
				// a gesture to open the item at the index
				// since we do not have any context menu
				// this enables for example macOS to Ctrl-
				// click on an item to open it.
				this._tree.setSelection([e.element]);
			}
		}));
	}

	private _registerHoverListeners() {
		const delayer = this._register(new ThrottledDelayer(this.hoverDelegate.delay));
		this._register(this._tree.onMouseOver(async e => {
			// If we hover over an anchor element, we don't want to show the hover because
			// the anchor may have a tooltip that we want to show instead.
			if (dom.isHTMLAnchorElement(e.browserEvent.target)) {
				delayer.cancel();
				return;
			}
			if (
				// anchors are an exception as called out above so we skip them here
				!(dom.isHTMLAnchorElement(e.browserEvent.relatedTarget)) &&
				// check if the mouse is still over the same element
				dom.isAncestor(e.browserEvent.relatedTarget as Node, e.element?.element as Node)
			) {
				return;
			}
			try {
				await delayer.trigger(async () => {
					if (e.element instanceof QuickPickItemElement) {
						this.showHover(e.element);
					}
				});
			} catch (e) {
				// Ignore cancellation errors due to mouse out
				if (!isCancellationError(e)) {
					throw e;
				}
			}
		}));
		this._register(this._tree.onMouseOut(e => {
			// onMouseOut triggers every time a new element has been moused over
			// even if it's on the same list item. We only want one event, so we
			// check if the mouse is still over the same element.
			if (dom.isAncestor(e.browserEvent.relatedTarget as Node, e.element?.element as Node)) {
				return;
			}
			delayer.cancel();
		}));
	}

	/**
	 * Register's focus change and mouse events so that we can track when items inside of a
	 * separator's section are focused or hovered so that we can display the separator's actions
	 */
	private _registerSeparatorActionShowingListeners() {
		this._register(this._tree.onDidChangeFocus(e => {
			const parent = e.elements[0]
				? this._tree.getParentElement(e.elements[0]) as QuickPickSeparatorElement
				// treat null as focus lost and when we have no separators
				: null;
			for (const separator of this._separatorRenderer.visibleSeparators) {
				const value = separator === parent;
				// get bitness of ACTIVE_ITEM and check if it changed
				const currentActive = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.ACTIVE_ITEM);
				if (currentActive !== value) {
					if (value) {
						separator.focusInsideSeparator |= QuickPickSeparatorFocusReason.ACTIVE_ITEM;
					} else {
						separator.focusInsideSeparator &= ~QuickPickSeparatorFocusReason.ACTIVE_ITEM;
					}

					this._tree.rerender(separator);
				}
			}
		}));
		this._register(this._tree.onMouseOver(e => {
			const parent = e.element
				? this._tree.getParentElement(e.element) as QuickPickSeparatorElement
				: null;
			for (const separator of this._separatorRenderer.visibleSeparators) {
				if (separator !== parent) {
					continue;
				}
				const currentMouse = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.MOUSE_HOVER);
				if (!currentMouse) {
					separator.focusInsideSeparator |= QuickPickSeparatorFocusReason.MOUSE_HOVER;
					this._tree.rerender(separator);
				}
			}
		}));
		this._register(this._tree.onMouseOut(e => {
			const parent = e.element
				? this._tree.getParentElement(e.element) as QuickPickSeparatorElement
				: null;
			for (const separator of this._separatorRenderer.visibleSeparators) {
				if (separator !== parent) {
					continue;
				}
				const currentMouse = !!(separator.focusInsideSeparator & QuickPickSeparatorFocusReason.MOUSE_HOVER);
				if (currentMouse) {
					separator.focusInsideSeparator &= ~QuickPickSeparatorFocusReason.MOUSE_HOVER;
					this._tree.rerender(separator);
				}
			}
		}));
	}

	private _registerSelectionChangeListener() {
		// When the user selects a separator, the separator will move to the top and focus will be
		// set to the first element after the separator.
		this._register(this._tree.onDidChangeSelection(e => {
			const elementsWithoutSeparators = e.elements.filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement);
			if (elementsWithoutSeparators.length !== e.elements.length) {
				if (e.elements.length === 1 && e.elements[0] instanceof QuickPickSeparatorElement) {
					this._tree.setFocus([e.elements[0].children[0]]);
					this._tree.reveal(e.elements[0], 0);
				}
				this._tree.setSelection(elementsWithoutSeparators);
			}
		}));
	}

	//#endregion

	//#region public methods

	setAllVisibleChecked(checked: boolean) {
		this._elementCheckedEventBufferer.bufferEvents(() => {
			this._itemElements.forEach(element => {
				if (!element.hidden && !element.checkboxDisabled) {
					// Would fire an event if we didn't beffer the events
					element.checked = checked;
				}
			});
		});
	}

	setElements(inputElements: QuickPickItem[]): void {
		this._elementDisposable.clear();
		this._lastQueryString = undefined;
		this._inputElements = inputElements;
		this._hasCheckboxes = this.parent.classList.contains('show-checkboxes');
		let currentSeparatorElement: QuickPickSeparatorElement | undefined;
		this._itemElements = new Array<QuickPickItemElement>();
		this._elementTree = inputElements.reduce((result, item, index) => {
			let element: IQuickPickElement;
			if (item.type === 'separator') {
				if (!item.buttons) {
					// This separator will be rendered as a part of the list item
					return result;
				}
				currentSeparatorElement = new QuickPickSeparatorElement(
					index,
					e => this._onSeparatorButtonTriggered.fire(e),
					item
				);
				element = currentSeparatorElement;
			} else {
				const previous = index > 0 ? inputElements[index - 1] : undefined;
				let separator: IQuickPickSeparator | undefined;
				if (previous && previous.type === 'separator' && !previous.buttons) {
					// Found an inline separator so we clear out the current separator element
					currentSeparatorElement = undefined;
					separator = previous;
				}
				const qpi = new QuickPickItemElement(
					index,
					this._hasCheckboxes,
					e => this._onButtonTriggered.fire(e),
					this._elementChecked,
					item,
					separator,
				);
				this._itemElements.push(qpi);

				if (currentSeparatorElement) {
					currentSeparatorElement.children.push(qpi);
					return result;
				}
				element = qpi;
			}

			result.push(element);
			return result;
		}, new Array<IQuickPickElement>());

		this._setElementsToTree(this._elementTree);

		// Accessibility hack, unfortunately on next tick
		// https://github.com/microsoft/vscode/issues/211976
		if (this.accessibilityService.isScreenReaderOptimized()) {
			setTimeout(() => {
				const focusedElement = this._tree.getHTMLElement().querySelector(`.monaco-list-row.focused`);
				const parent = focusedElement?.parentNode;
				if (focusedElement && parent) {
					const nextSibling = focusedElement.nextSibling;
					focusedElement.remove();
					parent.insertBefore(focusedElement, nextSibling);
				}
			}, 0);
		}
	}

	setFocusedElements(items: IQuickPickItem[]) {
		const elements = items.map(item => this._itemElements.find(e => e.item === item))
			.filter((e): e is QuickPickItemElement => !!e)
			.filter(e => !e.hidden);
		this._tree.setFocus(elements);
		if (items.length > 0) {
			const focused = this._tree.getFocus()[0];
			if (focused) {
				this._tree.reveal(focused);
			}
		}
	}

	getActiveDescendant() {
		return this._tree.getHTMLElement().getAttribute('aria-activedescendant');
	}

	setSelectedElements(items: IQuickPickItem[]) {
		const elements = items.map(item => this._itemElements.find(e => e.item === item))
			.filter((e): e is QuickPickItemElement => !!e);
		this._tree.setSelection(elements);
	}

	getCheckedElements() {
		return this._itemElements.filter(e => e.checked)
			.map(e => e.item);
	}

	setCheckedElements(items: IQuickPickItem[]) {
		this._elementCheckedEventBufferer.bufferEvents(() => {
			const checked = new Set();
			for (const item of items) {
				checked.add(item);
			}
			for (const element of this._itemElements) {
				// Would fire an event if we didn't beffer the events
				element.checked = checked.has(element.item);
			}
		});
	}

	focus(what: QuickPickFocus): void {
		if (!this._itemElements.length) {
			return;
		}

		if (what === QuickPickFocus.Second && this._itemElements.length < 2) {
			what = QuickPickFocus.First;
		}

		switch (what) {
			case QuickPickFocus.First:
				this._tree.scrollTop = 0;
				this._tree.focusFirst(undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickPickFocus.Second: {
				this._tree.scrollTop = 0;
				let isSecondItem = false;
				this._tree.focusFirst(undefined, (e) => {
					if (!(e.element instanceof QuickPickItemElement)) {
						return false;
					}
					if (isSecondItem) {
						return true;
					}
					isSecondItem = !isSecondItem;
					return false;
				});
				break;
			}
			case QuickPickFocus.Last:
				this._tree.scrollTop = this._tree.scrollHeight;
				this._tree.focusLast(undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickPickFocus.Next: {
				const prevFocus = this._tree.getFocus();
				this._tree.focusNext(undefined, this._shouldLoop, undefined, (e) => {
					if (!(e.element instanceof QuickPickItemElement)) {
						return false;
					}
					this._tree.reveal(e.element);
					return true;
				});
				const currentFocus = this._tree.getFocus();
				if (prevFocus.length && prevFocus[0] === currentFocus[0] && prevFocus[0] === this._itemElements[this._itemElements.length - 1]) {
					this._onLeave.fire();
				}
				break;
			}
			case QuickPickFocus.Previous: {
				const prevFocus = this._tree.getFocus();
				this._tree.focusPrevious(undefined, this._shouldLoop, undefined, (e) => {
					if (!(e.element instanceof QuickPickItemElement)) {
						return false;
					}
					const parent = this._tree.getParentElement(e.element);
					if (parent === null || (parent as QuickPickSeparatorElement).children[0] !== e.element) {
						this._tree.reveal(e.element);
					} else {
						// Only if we are the first child of a separator do we reveal the separator
						this._tree.reveal(parent);
					}
					return true;
				});
				const currentFocus = this._tree.getFocus();
				if (prevFocus.length && prevFocus[0] === currentFocus[0] && prevFocus[0] === this._itemElements[0]) {
					this._onLeave.fire();
				}
				break;
			}
			case QuickPickFocus.NextPage:
				this._tree.focusNextPage(undefined, (e) => {
					if (!(e.element instanceof QuickPickItemElement)) {
						return false;
					}
					this._tree.reveal(e.element);
					return true;
				});
				break;
			case QuickPickFocus.PreviousPage:
				this._tree.focusPreviousPage(undefined, (e) => {
					if (!(e.element instanceof QuickPickItemElement)) {
						return false;
					}
					const parent = this._tree.getParentElement(e.element);
					if (parent === null || (parent as QuickPickSeparatorElement).children[0] !== e.element) {
						this._tree.reveal(e.element);
					} else {
						this._tree.reveal(parent);
					}
					return true;
				});
				break;
			case QuickPickFocus.NextSeparator: {
				let foundSeparatorAsItem = false;
				const before = this._tree.getFocus()[0];
				this._tree.focusNext(undefined, true, undefined, (e) => {
					if (foundSeparatorAsItem) {
						// This should be the index right after the separator so it
						// is the item we want to focus.
						return true;
					}

					if (e.element instanceof QuickPickSeparatorElement) {
						foundSeparatorAsItem = true;
						// If the separator is visible, then we should just reveal its first child so it's not as jarring.
						if (this._separatorRenderer.isSeparatorVisible(e.element)) {
							this._tree.reveal(e.element.children[0]);
						} else {
							// If the separator is not visible, then we should
							// push it up to the top of the list.
							this._tree.reveal(e.element, 0);
						}
					} else if (e.element instanceof QuickPickItemElement) {
						if (e.element.separator) {
							if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
								this._tree.reveal(e.element);
							} else {
								this._tree.reveal(e.element, 0);
							}
							return true;
						} else if (e.element === this._elementTree[0]) {
							// We should stop at the first item in the list if it's a regular item.
							this._tree.reveal(e.element, 0);
							return true;
						}
					}
					return false;
				});
				const after = this._tree.getFocus()[0];
				if (before === after) {
					// If we didn't move, then we should just move to the end
					// of the list.
					this._tree.scrollTop = this._tree.scrollHeight;
					this._tree.focusLast(undefined, (e) => e.element instanceof QuickPickItemElement);
				}
				break;
			}
			case QuickPickFocus.PreviousSeparator: {
				let focusElement: IQuickPickElement | undefined;
				// If we are already sitting on an inline separator, then we
				// have already found the _current_ separator and need to
				// move to the previous one.
				let foundSeparator = !!this._tree.getFocus()[0]?.separator;
				this._tree.focusPrevious(undefined, true, undefined, (e) => {
					if (e.element instanceof QuickPickSeparatorElement) {
						if (foundSeparator) {
							if (!focusElement) {
								if (this._separatorRenderer.isSeparatorVisible(e.element)) {
									this._tree.reveal(e.element);
								} else {
									this._tree.reveal(e.element, 0);
								}
								focusElement = e.element.children[0];
							}
						} else {
							foundSeparator = true;
						}
					} else if (e.element instanceof QuickPickItemElement) {
						if (!focusElement) {
							if (e.element.separator) {
								if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
									this._tree.reveal(e.element);
								} else {
									this._tree.reveal(e.element, 0);
								}

								focusElement = e.element;
							} else if (e.element === this._elementTree[0]) {
								// We should stop at the first item in the list if it's a regular item.
								this._tree.reveal(e.element, 0);
								return true;
							}
						}
					}
					return false;
				});
				if (focusElement) {
					this._tree.setFocus([focusElement]);
				}
				break;
			}
		}
	}

	clearFocus() {
		this._tree.setFocus([]);
	}

	domFocus() {
		this._tree.domFocus();
	}

	layout(maxHeight?: number): void {
		this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${
			// Make sure height aligns with list item heights
			Math.floor(maxHeight / 44) * 44
			// Add some extra height so that it's clear there's more to scroll
			+ 6
			}px` : '';
		this._tree.layout();
	}

	filter(query: string): boolean {
		this._lastQueryString = query;
		if (!(this._sortByLabel || this._matchOnLabel || this._matchOnDescription || this._matchOnDetail)) {
			this._tree.layout();
			return false;
		}

		const queryWithWhitespace = query;
		query = query.trim();

		// Reset filtering
		if (!query || !(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
			this._itemElements.forEach(element => {
				element.labelHighlights = undefined;
				element.descriptionHighlights = undefined;
				element.detailHighlights = undefined;
				element.hidden = false;
				const previous = element.index && this._inputElements[element.index - 1];
				if (element.item) {
					element.separator = previous && previous.type === 'separator' && !previous.buttons ? previous : undefined;
				}
			});
		}

		// Filter by value (since we support icons in labels, use $(..) aware fuzzy matching)
		else {
			let currentSeparator: IQuickPickSeparator | undefined;
			this._itemElements.forEach(element => {
				let labelHighlights: IMatch[] | undefined;
				if (this.matchOnLabelMode === 'fuzzy') {
					labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
				} else {
					labelHighlights = this.matchOnLabel ? matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel)) ?? undefined : undefined;
				}
				const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || '')) ?? undefined : undefined;
				const detailHighlights = this.matchOnDetail ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || '')) ?? undefined : undefined;

				if (labelHighlights || descriptionHighlights || detailHighlights) {
					element.labelHighlights = labelHighlights;
					element.descriptionHighlights = descriptionHighlights;
					element.detailHighlights = detailHighlights;
					element.hidden = false;
				} else {
					element.labelHighlights = undefined;
					element.descriptionHighlights = undefined;
					element.detailHighlights = undefined;
					element.hidden = element.item ? !element.item.alwaysShow : true;
				}

				// Ensure separators are filtered out first before deciding if we need to bring them back
				if (element.item) {
					element.separator = undefined;
				} else if (element.separator) {
					element.hidden = true;
				}

				// we can show the separator unless the list gets sorted by match
				if (!this.sortByLabel) {
					const previous = element.index && this._inputElements[element.index - 1] || undefined;
					if (previous?.type === 'separator' && !previous.buttons) {
						currentSeparator = previous;
					}
					if (currentSeparator && !element.hidden) {
						element.separator = currentSeparator;
						currentSeparator = undefined;
					}
				}
			});
		}

		this._setElementsToTree(this._sortByLabel && query
			// We don't render any separators if we're sorting so just render the elements
			? this._itemElements
			// Render the full tree
			: this._elementTree
		);
		this._tree.layout();
		return true;
	}

	toggleCheckbox() {
		this._elementCheckedEventBufferer.bufferEvents(() => {
			const elements = this._tree.getFocus().filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement);
			const allChecked = this._allVisibleChecked(elements);
			for (const element of elements) {
				if (!element.checkboxDisabled) {
					// Would fire an event if we didn't have the flag set
					element.checked = !allChecked;
				}
			}
		});
	}

	style(styles: IListStyles) {
		this._tree.style(styles);
	}

	toggleHover() {
		const focused: IQuickPickElement | null = this._tree.getFocus()[0];
		if (!focused?.saneTooltip || !(focused instanceof QuickPickItemElement)) {
			return;
		}

		// if there's a hover already, hide it (toggle off)
		if (this._lastHover && !this._lastHover.isDisposed) {
			this._lastHover.dispose();
			return;
		}

		// If there is no hover, show it (toggle on)
		this.showHover(focused);
		const store = new DisposableStore();
		store.add(this._tree.onDidChangeFocus(e => {
			if (e.elements[0] instanceof QuickPickItemElement) {
				this.showHover(e.elements[0]);
			}
		}));
		if (this._lastHover) {
			store.add(this._lastHover);
		}
		this._elementDisposable.add(store);
	}

	//#endregion

	//#region private methods

	private _setElementsToTree(elements: IQuickPickElement[]) {
		const treeElements = new Array<IObjectTreeElement<IQuickPickElement>>();
		for (const element of elements) {
			if (element instanceof QuickPickSeparatorElement) {
				treeElements.push({
					element,
					collapsible: false,
					collapsed: false,
					children: element.children.map(e => ({
						element: e,
						collapsible: false,
						collapsed: false,
					})),
				});
			} else {
				treeElements.push({
					element,
					collapsible: false,
					collapsed: false,
				});
			}
		}
		this._tree.setChildren(null, treeElements);
	}

	private _allVisibleChecked(elements: QuickPickItemElement[], whenNoneVisible = true) {
		for (let i = 0, n = elements.length; i < n; i++) {
			const element = elements[i];
			if (!element.hidden) {
				if (!element.checked) {
					return false;
				} else {
					whenNoneVisible = true;
				}
			}
		}
		return whenNoneVisible;
	}

	private _updateCheckedObservables() {
		transaction((tx) => {
			this._allVisibleCheckedObservable.set(this._allVisibleChecked(this._itemElements, false), tx);
			const checkedCount = this._itemElements.filter(element => element.checked).length;
			this._checkedCountObservable.set(checkedCount, tx);
			this._checkedElementsObservable.set(this.getCheckedElements(), tx);
		});
	}

	/**
	 * Disposes of the hover and shows a new one for the given index if it has a tooltip.
	 * @param element The element to show the hover for
	 */
	private showHover(element: QuickPickItemElement): void {
		if (this._lastHover && !this._lastHover.isDisposed) {
			this.hoverDelegate.onDidHideHover?.();
			this._lastHover?.dispose();
		}

		if (!element.element || !element.saneTooltip) {
			return;
		}
		this._lastHover = this.hoverDelegate.showHover({
			content: element.saneTooltip,
			target: element.element,
			linkHandler: (url) => {
				this.linkOpenerDelegate(url);
			},
			appearance: {
				showPointer: true,
			},
			container: this._container,
			position: {
				hoverPosition: HoverPosition.RIGHT
			}
		}, false);
	}
}

function matchesContiguousIconAware(query: string, target: IParsedLabelWithIcons): IMatch[] | null {

	const { text, iconOffsets } = target;

	// Return early if there are no icon markers in the word to match against
	if (!iconOffsets || iconOffsets.length === 0) {
		return matchesContiguous(query, text);
	}

	// Trim the word to match against because it could have leading
	// whitespace now if the word started with an icon
	const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, ' ');
	const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;

	// match on value without icon
	const matches = matchesContiguous(query, wordToMatchAgainstWithoutIconsTrimmed);

	// Map matches back to offsets with icon and trimming
	if (matches) {
		for (const match of matches) {
			const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] /* icon offsets at index */ + leadingWhitespaceOffset /* overall leading whitespace offset */;
			match.start += iconOffset;
			match.end += iconOffset;
		}
	}

	return matches;
}

function matchesContiguous(word: string, wordToMatchAgainst: string): IMatch[] | null {
	const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
	if (matchIndex !== -1) {
		return [{ start: matchIndex, end: matchIndex + word.length }];
	}
	return null;
}

function compareEntries(elementA: IQuickPickElement, elementB: IQuickPickElement, lookFor: string): number {

	const labelHighlightsA = elementA.labelHighlights || [];
	const labelHighlightsB = elementB.labelHighlights || [];
	if (labelHighlightsA.length && !labelHighlightsB.length) {
		return -1;
	}

	if (!labelHighlightsA.length && labelHighlightsB.length) {
		return 1;
	}

	if (labelHighlightsA.length === 0 && labelHighlightsB.length === 0) {
		return 0;
	}

	return compareAnything(elementA.saneSortLabel, elementB.saneSortLabel, lookFor);
}
