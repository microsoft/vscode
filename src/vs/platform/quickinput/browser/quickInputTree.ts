/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import { IHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IQuickPickItem, IQuickPickItemButtonEvent, IQuickPickSeparator, IQuickPickSeparatorButtonEvent, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { IMatch } from 'vs/base/common/filters';
import { IListAccessibilityProvider, IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { OS, isMacintosh } from 'vs/base/common/platform';
import { memoize } from 'vs/base/common/decorators';
import { IIconLabelValueOptions, IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { KeybindingLabel } from 'vs/base/browser/ui/keybindingLabel/keybindingLabel';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { isDark } from 'vs/platform/theme/common/theme';
import { URI } from 'vs/base/common/uri';
import { IHoverWidget, ITooltipMarkdownString } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { quickInputButtonToAction } from 'vs/platform/quickinput/browser/quickInputUtils';
import { Lazy } from 'vs/base/common/lazy';
import { IParsedLabelWithIcons, getCodiconAriaLabel, matchesFuzzyIconAware, parseLabelWithIcons } from 'vs/base/common/iconLabels';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { compareAnything } from 'vs/base/common/comparers';
import { ltrim } from 'vs/base/common/strings';
import { RenderIndentGuides } from 'vs/base/browser/ui/tree/abstractTree';
import { ThrottledDelayer } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';

const $ = dom.$;

export enum QuickInputListFocus {
	First = 1,
	Second,
	Last,
	Next,
	Previous,
	NextPage,
	PreviousPage,
	NextSeparator,
	PreviousSeparator
}

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
	readonly onChecked: Event<boolean>;
	checked: boolean;
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

	readonly onChecked: Event<boolean>;

	constructor(
		readonly index: number,
		readonly hasCheckbox: boolean,
		private _onChecked: Emitter<{ element: IQuickPickElement; checked: boolean }>,
		mainItem: QuickPickItem
	) {
		this.onChecked = hasCheckbox
			? Event.map(Event.filter<{ element: IQuickPickElement; checked: boolean }>(this._onChecked.event, e => e.element === this), e => e.checked)
			: Event.None;
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

	private _hidden: boolean = false;
	get hidden() {
		return this._hidden;
	}
	set hidden(value: boolean) {
		this._hidden = value;
	}

	private _checked: boolean = false;
	get checked() {
		return this._checked;
	}
	set checked(value: boolean) {
		if (value !== this._checked) {
			this._checked = value;
			this._onChecked.fire({ element: this, checked: value });
		}
	}

	protected _saneDescription?: string;
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

	protected _saneTooltip?: string | IMarkdownString | HTMLElement;
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
	constructor(
		index: number,
		hasCheckbox: boolean,
		readonly fireButtonTriggered: (event: IQuickPickItemButtonEvent<IQuickPickItem>) => void,
		onCheckedEmitter: Emitter<{ element: IQuickPickElement; checked: boolean }>,
		readonly item: IQuickPickItem,
		previous: QuickPickItem | undefined,
	) {
		super(index, hasCheckbox, onCheckedEmitter, item);
		this._saneDescription = item.description;
		this._saneDetail = item.detail;
		this._saneTooltip = this.item.tooltip;
		this._labelHighlights = item.highlights?.label;
		this._descriptionHighlights = item.highlights?.description;
		this._detailHighlights = item.highlights?.detail;

		if (previous && previous.type === 'separator' && !previous.buttons) {
			this._separator = previous;
		}
	}

	private _separator: IQuickPickSeparator | undefined;
	get separator() {
		return this._separator;
	}
	set separator(value: IQuickPickSeparator | undefined) {
		this._separator = value;
	}
}

class QuickPickSeparatorElement extends BaseQuickPickItemElement {
	children = new Array<QuickPickItemElement>();

	constructor(
		index: number,
		readonly fireSeparatorButtonTriggered: (event: IQuickPickSeparatorButtonEvent) => void,
		// TODO: remove this
		onCheckedEmitter: Emitter<{ element: IQuickPickElement; checked: boolean }>,
		readonly separator: IQuickPickSeparator,
	) {
		super(index, false, onCheckedEmitter, separator);
	}
}

class QuickInputItemDelegate implements IListVirtualDelegate<IQuickPickElement> {
	getHeight(element: IQuickPickElement): number {

		if (!element.item) {
			// must be a separator
			return 24;
		}
		return element.saneDetail ? 44 : 22;
	}

	getTemplateId(element: IQuickPickElement): string {
		return QuickInputListRenderer.ID;
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

	isChecked(element: IQuickPickElement) {
		if (!element.hasCheckbox) {
			return undefined;
		}

		return {
			value: element.checked,
			onDidChange: element.onChecked
		};
	}
}

class QuickInputListRenderer implements ITreeRenderer<IQuickPickElement, void, IQuickInputItemTemplateData> {

	static readonly ID = 'listelement';

	constructor(
		private readonly hoverDelegate: IHoverDelegate | undefined,
		@IThemeService private readonly themeService: IThemeService,
	) { }

	get templateId() {
		return QuickInputListRenderer.ID;
	}

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
		data.toDisposeTemplate.add(dom.addStandardDisposableListener(data.checkbox, dom.EventType.CHANGE, e => {
			data.element.checked = data.checkbox.checked;
		}));

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
	renderElement(node: ITreeNode<IQuickPickElement, void>, index: number, data: IQuickInputItemTemplateData): void {
		const element = node.element;
		data.element = element;
		element.element = data.entry ?? undefined;
		const mainItem: QuickPickItem = element.item ? element.item : element.separator!;

		data.checkbox.checked = element.checked;
		data.toDisposeElement.add(element.onChecked(checked => data.checkbox.checked = checked));

		const { labelHighlights, descriptionHighlights, detailHighlights } = element;

		if (element.item?.iconPath) {
			const icon = isDark(this.themeService.getColorTheme().type) ? element.item.iconPath.dark : (element.item.iconPath.light ?? element.item.iconPath.dark);
			const iconUrl = URI.revive(icon);
			data.icon.className = 'quick-input-list-icon';
			data.icon.style.backgroundImage = dom.asCSSUrl(iconUrl);
		} else {
			data.icon.style.backgroundImage = '';
			data.icon.className = element.item?.iconClass ? `quick-input-list-icon ${element.item.iconClass}` : '';
		}

		// Label
		let descriptionTitle: ITooltipMarkdownString | undefined;
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
		if (mainItem.type !== 'separator') {
			options.extraClasses = mainItem.iconClasses;
			options.italic = mainItem.italic;
			options.strikethrough = mainItem.strikethrough;
			data.entry.classList.remove('quick-input-list-separator-as-item');
		} else {
			data.entry.classList.add('quick-input-list-separator-as-item');
		}
		data.label.setLabel(element.saneLabel, element.saneDescription, options);

		// Keybinding
		data.keybinding.set(mainItem.type === 'separator' ? undefined : mainItem.keybinding);

		// Detail
		if (element.saneDetail) {
			let title: ITooltipMarkdownString | undefined;
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
		if (element.item && element.separator && element.separator.label) {
			data.separator.textContent = element.separator.label;
			data.separator.style.display = '';
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
				() => element instanceof QuickPickItemElement
					? element.fireButtonTriggered({ button, item: element.item })
					: (element as QuickPickSeparatorElement).fireSeparatorButtonTriggered({ button, separator: element.separator! })
			)), { icon: true, label: false });
			data.entry.classList.add('has-actions');
		} else {
			data.entry.classList.remove('has-actions');
		}
	}
	renderTwistie(element: IQuickPickElement, twistieElement: HTMLElement): boolean {
		// Force the twistie to be hidden
		twistieElement.setAttribute('style', 'display:none !important');
		return false;
	}
	disposeElement?(_element: ITreeNode<IQuickPickElement, void>, _index: number, data: IQuickInputItemTemplateData): void {
		data.toDisposeElement.clear();
		data.actionBar.clear();
	}
	disposeTemplate(data: IQuickInputItemTemplateData): void {
		data.toDisposeElement.dispose();
		data.toDisposeTemplate.dispose();
	}
}

export class QuickInputTree extends Disposable {

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

	private readonly _onChangedAllVisibleChecked = new Emitter<boolean>();
	onChangedAllVisibleChecked: Event<boolean> = this._onChangedAllVisibleChecked.event;

	private readonly _onChangedCheckedCount = new Emitter<number>();
	onChangedCheckedCount: Event<number> = this._onChangedCheckedCount.event;

	private readonly _onChangedVisibleCount = new Emitter<number>();
	onChangedVisibleCount: Event<number> = this._onChangedVisibleCount.event;

	private readonly _onChangedCheckedElements = new Emitter<IQuickPickItem[]>();
	onChangedCheckedElements: Event<IQuickPickItem[]> = this._onChangedCheckedElements.event;

	private readonly _onButtonTriggered = new Emitter<IQuickPickItemButtonEvent<IQuickPickItem>>();
	onButtonTriggered = this._onButtonTriggered.event;

	private readonly _onSeparatorButtonTriggered = new Emitter<IQuickPickSeparatorButtonEvent>();
	onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;

	private readonly _container: HTMLElement;
	private readonly _tree: WorkbenchObjectTree<IQuickPickElement, void>;
	private readonly _elementChecked = new Emitter<{ element: IQuickPickElement; checked: boolean }>();
	private _inputElements = new Array<QuickPickItem>();
	private _elements = new Array<IQuickPickElement>();
	private _itemElements = new Array<QuickPickItemElement>();
	// Elements that apply to the current set of elements
	private _elementDisposable = this._register(new DisposableStore());
	private _lastHover: IHoverWidget | undefined;

	constructor(
		private parent: HTMLElement,
		private hoverDelegate: IHoverDelegate,
		private linkOpenerDelegate: (content: string) => void,
		id: string,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._container = dom.append(this.parent, $('.quick-input-list'));
		this._tree = this._register(instantiationService.createInstance(
			WorkbenchObjectTree<IQuickPickElement, void>,
			'QuickInput',
			this._container,
			new QuickInputItemDelegate(),
			[instantiationService.createInstance(QuickInputListRenderer, hoverDelegate)],
			{
				accessibilityProvider: new QuickInputAccessibilityProvider(),
				setRowLineHeight: false,
				multipleSelectionSupport: false,
				hideTwistiesOfChildlessElements: true,
				renderIndentGuides: RenderIndentGuides.None,
				findWidgetEnabled: false,
				indent: 0,
				horizontalScrolling: false,
				allowNonCollapsibleParents: true,
				identityProvider: {
					getId: element => {
						// always prefer item over separator because if item is defined, it must be the main item type
						// always prefer a defined id if one was specified and use label as a fallback
						return element.item?.id
							?? element.item?.label
							?? element.separator?.id
							?? element.separator?.label
							?? '';
					}
				},
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
			e => e.elements.filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement).map(e => e.item)
		);
	}

	@memoize
	get onDidChangeSelection() {
		return Event.map(
			this._tree.onDidChangeSelection,
			e => ({
				items: e.elements.filter((e): e is QuickPickItemElement => e instanceof QuickPickItemElement).map(e => e.item),
				event: e.browserEvent
			}));
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

	//#endregion

	//#region register listeners

	private _registerListeners() {
		this._registerOnKeyDown();
		this._registerOnContainerClick();
		this._registerOnMouseMiddleClick();
		this._registerOnElementChecked();
		this._registerOnContextMenu();
		this._registerHoverListeners();
		this._registerSelectionChangeListener();
	}

	private _registerOnKeyDown() {
		// TODO: Should this be added at a higher level?
		this._register(this._tree.onKeyDown(e => {
			const event = new StandardKeyboardEvent(e);
			switch (event.keyCode) {
				case KeyCode.Space:
					this.toggleCheckbox();
					break;
				case KeyCode.KeyA:
					if (isMacintosh ? e.metaKey : e.ctrlKey) {
						this._tree.setFocus(this._itemElements);
					}
					break;
				// When we hit the top of the tree, we fire the onLeave event.
				case KeyCode.UpArrow: {
					const focus1 = this._tree.getFocus();
					if (focus1.length === 1 && focus1[0] === this._itemElements[0]) {
						this._onLeave.fire();
					}
					break;
				}
				// When we hit the bottom of the tree, we fire the onLeave event.
				case KeyCode.DownArrow: {
					const focus2 = this._tree.getFocus();
					if (focus2.length === 1 && focus2[0] === this._itemElements[this._itemElements.length - 1]) {
						this._onLeave.fire();
					}
					break;
				}
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

	private _registerOnElementChecked() {
		this._register(this._elementChecked.event(_ => this._fireCheckedEvents()));
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
			if (e.browserEvent.target instanceof HTMLAnchorElement) {
				delayer.cancel();
				return;
			}
			if (
				// anchors are an exception as called out above so we skip them here
				!(e.browserEvent.relatedTarget instanceof HTMLAnchorElement) &&
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

	getAllVisibleChecked() {
		return this._allVisibleChecked(this._itemElements, false);
	}

	getCheckedCount() {
		return this._itemElements.filter(element => element.checked).length;
	}

	getVisibleCount() {
		return this._itemElements.filter(e => !e.hidden).length;
	}

	setAllVisibleChecked(checked: boolean) {
		this._itemElements.forEach(element => {
			if (!element.hidden) {
				element.checked = checked;
			}
		});
		this._fireCheckedEvents();
	}

	setElements(inputElements: QuickPickItem[]): void {
		this._elementDisposable.clear();
		this._inputElements = inputElements;
		const elementsToIndexes = new Map<QuickPickItem, number>();
		const hasCheckbox = this.parent.classList.contains('show-checkboxes');
		let currentSeparatorElement: QuickPickSeparatorElement | undefined;
		this._itemElements = new Array<QuickPickItemElement>();
		this._elements = inputElements.reduce((result, item, index) => {
			let element: IQuickPickElement;
			if (item.type === 'separator') {
				if (!item.buttons) {
					// This separator will be rendered as a part of the list item
					return result;
				}
				currentSeparatorElement = new QuickPickSeparatorElement(
					index,
					(event: IQuickPickSeparatorButtonEvent) => this.fireSeparatorButtonTriggered(event),
					this._elementChecked,
					item
				);
				element = currentSeparatorElement;
			} else {
				const previous = index > 0 ? inputElements[index - 1] : undefined;
				const qpi = new QuickPickItemElement(
					index,
					hasCheckbox,
					(event: IQuickPickItemButtonEvent<IQuickPickItem>) => this.fireButtonTriggered(event),
					this._elementChecked,
					item,
					previous,
				);
				this._itemElements.push(qpi);

				if (currentSeparatorElement) {
					currentSeparatorElement.children.push(qpi);
					return result;
				}
				element = qpi;
			}

			const resultIndex = result.length;
			result.push(element);
			elementsToIndexes.set(element.item ?? element.separator!, resultIndex);
			return result;
		}, new Array<IQuickPickElement>());

		// if we ever saw a separator item, we render "tree like"
		if (currentSeparatorElement) {
			const elements = new Array<IObjectTreeElement<IQuickPickElement>>();
			let visibleCount = 0;
			for (const element of this._elements) {
				if (element instanceof QuickPickSeparatorElement) {
					elements.push({
						element,
						collapsible: false,
						collapsed: false,
						children: element.children.map(e => ({
							element: e,
							collapsible: false,
							collapsed: false,
						})),
					});
					visibleCount += element.children.length + 1; // +1 for the separator itself;
				} else {
					elements.push({
						element,
						collapsible: false,
						collapsed: false,
					});
					visibleCount++;
				}
			}
			this._tree.setChildren(null, elements);
			this._onChangedVisibleCount.fire(visibleCount);
		} else {
			// All elements are items so we render "flat"
			this._tree.setChildren(
				null,
				this._elements.map<IObjectTreeElement<IQuickPickElement>>(e => ({
					element: e,
					collapsible: false,
					collapsed: false,
				}))
			);
			this._onChangedVisibleCount.fire(this._elements.length);
		}
	}

	getElementsCount(): number {
		return this._inputElements.length;
	}

	getFocusedElements() {
		return this._tree.getFocus()
			.filter((e): e is IQuickPickElement => !!e)
			.map(e => e.item)
			.filter((e): e is IQuickPickItem => !!e);
	}

	setFocusedElements(items: IQuickPickItem[]) {
		const elements = items.map(item => this._itemElements.find(e => e.item === item))
			.filter((e): e is QuickPickItemElement => !!e);
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

	getSelectedElements() {
		return this._tree.getSelection()
			.filter((e): e is IQuickPickElement => !!e && !!(e as QuickPickItemElement).item)
			.map(e => e.item);
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
		const checked = new Set();
		for (const item of items) {
			checked.add(item);
		}
		for (const element of this._itemElements) {
			element.checked = checked.has(element.item);
		}
		this._fireCheckedEvents();
	}

	focus(what: QuickInputListFocus): void {
		if (!this._itemElements.length) {
			return;
		}

		if (what === QuickInputListFocus.Second && this._itemElements.length < 2) {
			what = QuickInputListFocus.First;
		}

		switch (what) {
			case QuickInputListFocus.First:
				this._tree.scrollTop = 0;
				this._tree.focusFirst(undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickInputListFocus.Second:
				this._tree.scrollTop = 0;
				this._tree.setFocus([this._itemElements[1]]);
				break;
			case QuickInputListFocus.Last:
				this._tree.scrollTop = this._tree.scrollHeight;
				this._tree.setFocus([this._itemElements[this._itemElements.length - 1]]);
				break;
			case QuickInputListFocus.Next:
				this._tree.focusNext(undefined, true, undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickInputListFocus.Previous:
				this._tree.focusPrevious(undefined, true, undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickInputListFocus.NextPage:
				this._tree.focusNextPage(undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickInputListFocus.PreviousPage:
				this._tree.focusPreviousPage(undefined, (e) => e.element instanceof QuickPickItemElement);
				break;
			case QuickInputListFocus.NextSeparator: {
				let foundSeparatorAsItem = false;
				this._tree.focusNext(undefined, true, undefined, (e) => {
					if (foundSeparatorAsItem) {
						// This should be the index right after the separator so it
						// is the item we want to focus.
						return true;
					}

					if (e.element instanceof QuickPickSeparatorElement) {
						foundSeparatorAsItem = true;
					} else if (e.element instanceof QuickPickItemElement) {
						if (e.element.separator) {
							return true;
						}
					}
					return false;
				});
				break;
			}
			case QuickInputListFocus.PreviousSeparator: {
				let focusElement: IQuickPickElement | undefined;
				// If we are already sitting on an inline separator, then we
				// have already found the _current_ separator and need to
				// move to the previous one.
				let foundSeparator = !!this._tree.getFocus()[0]?.separator;
				this._tree.focusPrevious(undefined, true, undefined, (e) => {
					if (e.element instanceof QuickPickSeparatorElement) {
						if (foundSeparator) {
							focusElement ??= e.element.children[0];
						} else {
							foundSeparator = true;
						}
					} else if (e.element instanceof QuickPickItemElement) {
						if (e.element.separator) {
							focusElement ??= e.element;
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

		const focused = this._tree.getFocus()[0];
		if (focused) {
			// TODO: can this be improved?
			const indexOfFocused = this._itemElements.indexOf(focused as QuickPickItemElement);
			const indexOfFirstVisible = this._tree.firstVisibleElement ? this._itemElements.indexOf(this._tree.firstVisibleElement as QuickPickItemElement) : -1;
			if (focused !== this._itemElements[0] && !this._itemElements[indexOfFocused - 1].item && indexOfFirstVisible > indexOfFocused - 1) {
				this._tree.reveal(this._elements[indexOfFocused - 1]);
			} else {
				this._tree.reveal(focused);
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
			this._elements.forEach(element => {
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
					const previous = element.index && this._inputElements[element.index - 1];
					currentSeparator = previous && previous.type === 'separator' ? previous : currentSeparator;
					if (currentSeparator && !element.hidden) {
						element.separator = currentSeparator;
						currentSeparator = undefined;
					}
				}
			});
		}

		const shownElements = this._elements.filter(element => !element.hidden);

		// Sort by value
		if (this.sortByLabel && query) {
			const normalizedSearchValue = query.toLowerCase();
			shownElements.sort((a, b) => {
				return compareEntries(a, b, normalizedSearchValue);
			});
		}

		let currentSeparator: QuickPickSeparatorElement | undefined;
		const finalElements = shownElements.reduce((result, element, index) => {
			if (element instanceof QuickPickItemElement) {
				if (currentSeparator) {
					currentSeparator.children.push(element);
				} else {
					result.push(element);
				}
			} else if (element instanceof QuickPickSeparatorElement) {
				element.children = [];
				currentSeparator = element;
				result.push(element);
			}
			return result;
		}, new Array<IQuickPickElement>());

		// if we ever saw a separator item, we render "tree like"
		if (currentSeparator) {
			const elements = new Array<IObjectTreeElement<IQuickPickElement>>();
			for (const element of finalElements) {
				if (element instanceof QuickPickSeparatorElement) {
					elements.push({
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
					elements.push({
						element,
						collapsible: false,
						collapsed: false,
					});
				}
			}
			this._tree.setChildren(null, elements);
		} else {
			// All elements are items so we render "flat"
			this._tree.setChildren(
				null,
				finalElements.map<IObjectTreeElement<IQuickPickElement>>(e => ({
					element: e,
					collapsible: false,
					collapsed: false,
				}))
			);
		}

		this._tree.layout();

		this._onChangedAllVisibleChecked.fire(this.getAllVisibleChecked());
		this._onChangedVisibleCount.fire(shownElements.length);

		return true;
	}

	toggleCheckbox() {
		const elements = this._tree.getFocus().filter((e): e is IQuickPickElement => !!e);
		const allChecked = this._allVisibleChecked(elements);
		for (const element of elements) {
			element.checked = !allChecked;
		}
		this._fireCheckedEvents();
	}

	display(display: boolean) {
		this._container.style.display = display ? '' : 'none';
	}

	isDisplayed() {
		return this._container.style.display !== 'none';
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

	private _allVisibleChecked(elements: IQuickPickElement[], whenNoneVisible = true) {
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

	private _fireCheckedEvents() {
		this._onChangedAllVisibleChecked.fire(this.getAllVisibleChecked());
		this._onChangedCheckedCount.fire(this.getCheckedCount());
		this._onChangedCheckedElements.fire(this.getCheckedElements());
	}

	private fireButtonTriggered(event: IQuickPickItemButtonEvent<IQuickPickItem>) {
		this._onButtonTriggered.fire(event);
	}

	private fireSeparatorButtonTriggered(event: IQuickPickSeparatorButtonEvent) {
		this._onSeparatorButtonTriggered.fire(event);
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
