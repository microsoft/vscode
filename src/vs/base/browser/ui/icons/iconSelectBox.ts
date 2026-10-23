/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './iconSelectBox.css';
import * as dom from '../../dom.js';
import { StandardKeyboardEvent } from '../../keyboardEvent.js';
import { status } from '../aria/aria.js';
import { IInputBoxStyles, InputBox } from '../inputbox/inputBox.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';
import { Emitter } from '../../../common/event.js';
import { IDisposable, DisposableStore, Disposable, MutableDisposable } from '../../../common/lifecycle.js';
import { ThemeIcon } from '../../../common/themables.js';
import { localize } from '../../../../nls.js';
import { IMatch } from '../../../common/filters.js';
import { ScrollbarVisibility } from '../../../common/scrollable.js';
import { HighlightedLabel } from '../highlightedlabel/highlightedLabel.js';
import { KeyCode } from '../../../common/keyCodes.js';

export interface IIconSelectBoxOptions {
	readonly icons: ThemeIcon[];
	readonly inputBoxStyles: IInputBoxStyles;
	readonly showIconInfo?: boolean;
}

interface IRenderedIconItem {
	readonly icon: ThemeIcon;
	readonly element: HTMLElement;
	readonly highlightMatches?: IMatch[];
}

export class IconSelectBox extends Disposable {

	private static InstanceCount = 0;
	readonly domId = `icon_select_box_id_${++IconSelectBox.InstanceCount}`;

	readonly domNode: HTMLElement;

	private _onDidSelect = this._register(new Emitter<ThemeIcon>());
	readonly onDidSelect = this._onDidSelect.event;

	private renderedIcons: IRenderedIconItem[] = [];

	private focusedItemIndex: number = 0;
	private numberOfElementsPerRow: number = 1;
	private dimension: dom.Dimension | undefined;

	protected inputBox: InputBox | undefined;
	private scrollableElement: DomScrollableElement | undefined;
	private iconsContainer: HTMLElement | undefined;
	private iconIdElement: HighlightedLabel | undefined;
	private readonly iconContainerWidth = 36;
	private readonly iconContainerHeight = 36;

	constructor(
		private readonly options: IIconSelectBoxOptions,
	) {
		super();
		this.domNode = dom.$('.icon-select-box');
		this._register(this.create());
		this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, event => this.onKeyDown(event)));
	}

	private onKeyDown(event: KeyboardEvent): void {
		const key = new StandardKeyboardEvent(event).keyCode;
		const inputFocused = this.inputBox?.hasFocus();
		if (inputFocused && (key === KeyCode.LeftArrow || key === KeyCode.RightArrow || key === KeyCode.Home || key === KeyCode.End)) {
			event.stopPropagation();
			return;
		}
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
			return;
		}
		if (inputFocused && key !== KeyCode.DownArrow && key !== KeyCode.UpArrow && key !== KeyCode.Enter) {
			return;
		}
		switch (key) {
			case KeyCode.DownArrow: this.focusNextRow(); break;
			case KeyCode.UpArrow: this.focusPreviousRow(); break;
			case KeyCode.RightArrow: this.focusNext(); break;
			case KeyCode.LeftArrow: this.focusPrevious(); break;
			case KeyCode.Home: this.focusFirst(); break;
			case KeyCode.End: this.focusLast(); break;
			case KeyCode.Enter:
			case KeyCode.Space:
				if (this.focusedItemIndex >= 0) {
					this.setSelection(this.focusedItemIndex);
				}
				break;
			default: return;
		}
		dom.EventHelper.stop(event, true);
	}

	private create(): IDisposable {
		const disposables = new DisposableStore();

		const iconSelectBoxContainer = dom.append(this.domNode, dom.$('.icon-select-box-container'));
		iconSelectBoxContainer.style.margin = '10px 15px';

		const iconSelectInputContainer = dom.append(iconSelectBoxContainer, dom.$('.icon-select-input-container'));
		iconSelectInputContainer.style.paddingBottom = '10px';
		this.inputBox = disposables.add(new InputBox(iconSelectInputContainer, undefined, {
			placeholder: localize('iconSelect.placeholder', "Search icons"),
			ariaLabel: localize('iconSelect.search', "Search icons"),
			inputBoxStyles: this.options.inputBoxStyles,
		}));

		const iconsContainer = this.iconsContainer = dom.$('.icon-select-icons-container', { id: `${this.domId}_icons` });
		iconsContainer.role = 'listbox';
		iconsContainer.ariaLabel = localize('iconSelect.icons', "Icons");
		iconsContainer.tabIndex = 0;
		this.scrollableElement = disposables.add(new DomScrollableElement(iconsContainer, {
			useShadows: false,
			horizontal: ScrollbarVisibility.Hidden,
		}));
		dom.append(iconSelectBoxContainer, this.scrollableElement.getDomNode());

		if (this.options.showIconInfo) {
			this.iconIdElement = this._register(new HighlightedLabel(dom.append(dom.append(iconSelectBoxContainer, dom.$('.icon-select-id-container')), dom.$('.icon-select-id-label'))));
		}

		const iconsDisposables = disposables.add(new MutableDisposable());
		iconsDisposables.value = this.renderIcons(this.options.icons, [], iconsContainer);
		this.scrollableElement.scanDomNode();

		disposables.add(this.inputBox.onDidChange(value => {
			const icons = [], matches = [];
			for (const icon of this.options.icons) {
				const match = this.matchesContiguous(value, icon.id);
				if (match) {
					icons.push(icon);
					matches.push(match);
				}
			}
			iconsDisposables.value = this.renderIcons(icons, matches, iconsContainer);
			if (this.dimension) {
				this.layout(this.dimension);
			} else {
				this.scrollableElement?.scanDomNode();
			}
		}));

		this.inputBox.inputElement.role = 'combobox';
		this.inputBox.inputElement.ariaHasPopup = 'listbox';
		this.inputBox.inputElement.ariaAutoComplete = 'list';
		this.inputBox.inputElement.ariaExpanded = 'true';
		this.inputBox.inputElement.setAttribute('aria-controls', iconsContainer.id);

		return disposables;
	}

	private renderIcons(icons: ThemeIcon[], matches: IMatch[][], container: HTMLElement): IDisposable {
		const disposables = new DisposableStore();
		dom.clearNode(container);
		const focusedIcon = this.renderedIcons[this.focusedItemIndex]?.icon;
		let focusedIconIndex = 0;
		const renderedIcons: IRenderedIconItem[] = [];
		if (icons.length) {
			for (let index = 0; index < icons.length; index++) {
				const icon = icons[index];
				const iconContainer = dom.append(container, dom.$('.icon-container', { id: `${this.domId}_icons_${index}` }));
				iconContainer.style.width = `${this.iconContainerWidth}px`;
				iconContainer.style.height = `${this.iconContainerHeight}px`;
				iconContainer.title = icon.id;
				iconContainer.role = 'option';
				iconContainer.ariaLabel = icon.id;
				iconContainer.ariaSelected = 'false';
				iconContainer.setAttribute('aria-setsize', `${icons.length}`);
				iconContainer.setAttribute('aria-posinset', `${index + 1}`);
				dom.append(iconContainer, dom.$(ThemeIcon.asCSSSelector(icon))).ariaHidden = 'true';
				renderedIcons.push({ icon, element: iconContainer, highlightMatches: matches[index] });

				disposables.add(dom.addDisposableListener(iconContainer, dom.EventType.CLICK, (e: MouseEvent) => {
					e.stopPropagation();
					this.setSelection(index);
				}));

				if (icon === focusedIcon) {
					focusedIconIndex = index;
				}
			}
		} else {
			const noResults = localize('iconSelect.noResults', "No results");
			dom.append(container, dom.$('.icon-no-results', undefined, noResults));
			if (this.renderedIcons.length > 0) {
				status(noResults);
			}
		}

		this.renderedIcons.splice(0, this.renderedIcons.length, ...renderedIcons);
		this.focusIcon(focusedIconIndex);

		return disposables;
	}

	private focusIcon(index: number): void {
		const existing = this.renderedIcons[this.focusedItemIndex];
		if (existing) {
			existing.element.classList.remove('focused');
			existing.element.ariaSelected = 'false';
		}

		index = this.renderedIcons.length === 0 ? -1 : Math.max(0, Math.min(index, this.renderedIcons.length - 1));
		this.focusedItemIndex = index;
		const renderedItem = this.renderedIcons[index];

		if (renderedItem) {
			renderedItem.element.classList.add('focused');
			renderedItem.element.ariaSelected = 'true';
		}
		if (this.iconsContainer) {
			if (renderedItem) {
				this.iconsContainer.setAttribute('aria-activedescendant', renderedItem.element.id);
			} else {
				this.iconsContainer.removeAttribute('aria-activedescendant');
			}
		}

		if (this.inputBox) {
			if (renderedItem) {
				this.inputBox.inputElement.setAttribute('aria-activedescendant', renderedItem.element.id);
			} else {
				this.inputBox.inputElement.removeAttribute('aria-activedescendant');
			}
		}

		if (this.iconIdElement) {
			if (renderedItem) {
				this.iconIdElement.set(renderedItem.icon.id, renderedItem.highlightMatches);
			} else {
				this.iconIdElement.set('');
			}
		}

		this.reveal(index);
	}

	private reveal(index: number): void {
		if (!this.scrollableElement) {
			return;
		}
		if (index < 0 || index >= this.renderedIcons.length) {
			return;
		}
		const element = this.renderedIcons[index].element;
		if (!element) {
			return;
		}
		const { height } = this.scrollableElement.getScrollDimensions();
		const { scrollTop } = this.scrollableElement.getScrollPosition();
		if (element.offsetTop + this.iconContainerHeight > scrollTop + height) {
			this.scrollableElement.setScrollPosition({ scrollTop: element.offsetTop + this.iconContainerHeight - height });
		} else if (element.offsetTop < scrollTop) {
			this.scrollableElement.setScrollPosition({ scrollTop: element.offsetTop });
		}
	}

	private matchesContiguous(word: string, wordToMatchAgainst: string): IMatch[] | null {
		const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
		if (matchIndex !== -1) {
			return [{ start: matchIndex, end: matchIndex + word.length }];
		}
		return null;
	}

	layout(dimension: dom.Dimension): void {
		this.dimension = dimension;
		this.domNode.style.width = `${dimension.width}px`;
		this.domNode.style.height = `${dimension.height}px`;

		const iconsContainerWidth = dimension.width - 30;
		this.numberOfElementsPerRow = Math.floor(iconsContainerWidth / this.iconContainerWidth);
		if (this.numberOfElementsPerRow === 0) {
			throw new Error('Insufficient width');
		}

		const extraSpace = iconsContainerWidth % this.iconContainerWidth;
		const iconElementMargin = Math.floor(extraSpace / this.numberOfElementsPerRow);
		for (const { element } of this.renderedIcons) {
			element.style.marginRight = `${iconElementMargin}px`;
		}

		const containerPadding = extraSpace % this.numberOfElementsPerRow;
		if (this.iconsContainer) {
			this.iconsContainer.style.paddingLeft = `${Math.floor(containerPadding / 2)}px`;
			this.iconsContainer.style.paddingRight = `${Math.ceil(containerPadding / 2)}px`;
		}

		if (this.scrollableElement) {
			this.scrollableElement.getDomNode().style.height = `${this.iconIdElement ? dimension.height - 80 : dimension.height - 40}px`;
			this.scrollableElement.scanDomNode();
		}
		this.reveal(this.focusedItemIndex);
	}

	getFocus(): number[] {
		return this.focusedItemIndex < 0 ? [] : [this.focusedItemIndex];
	}

	setSelection(index: number): void {
		if (index < 0 || index >= this.renderedIcons.length) {
			throw new Error(`Invalid index ${index}`);
		}
		this.focusIcon(index);
		this._onDidSelect.fire(this.renderedIcons[index].icon);
	}

	clearInput(): void {
		if (this.inputBox) {
			this.inputBox.value = '';
		}
	}

	focus(): void {
		this.inputBox?.focus();
		this.focusIcon(0);
	}

	focusNext(): void {
		this.focusIcon(this.focusedItemIndex + 1);
	}

	focusPrevious(): void {
		this.focusIcon(this.focusedItemIndex - 1);
	}

	focusNextRow(): void {
		if (this.renderedIcons.length > 0 && this.inputBox?.hasFocus()) {
			this.iconsContainer?.focus();
			return;
		}
		this.focusIcon(this.focusedItemIndex + this.numberOfElementsPerRow);
	}

	focusPreviousRow(): void {
		if (this.focusedItemIndex < this.numberOfElementsPerRow) {
			this.inputBox?.focus();
			return;
		}
		this.focusIcon(this.focusedItemIndex - this.numberOfElementsPerRow);
	}

	focusFirst(): void {
		this.focusIcon(0);
	}

	focusLast(): void {
		this.focusIcon(this.renderedIcons.length - 1);
	}

	getFocusedIcon(): ThemeIcon | undefined {
		return this.renderedIcons[this.focusedItemIndex]?.icon;
	}

}
