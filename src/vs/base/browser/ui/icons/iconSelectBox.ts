/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./iconSelectBox';
import * as dom from 'vs/base/browser/dom';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IInputBoxStyles, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore, Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IMatch } from 'vs/base/common/filters';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';

export interface IIconSelectBoxOptions {
	readonly icons: ThemeIcon[];
	readonly inputBoxStyles: IInputBoxStyles;
}

export class IconSelectBox extends Disposable {

	readonly domNode: HTMLElement;

	private _onDidSelect = this._register(new Emitter<ThemeIcon>());
	readonly onDidSelect = this._onDidSelect.event;

	private renderedIcons: [ThemeIcon, HTMLElement][] = [];

	private focusedItemIndex: number = 0;
	private numberOfElementsPerRow: number = 1;

	private inputBox: InputBox | undefined;
	private scrollableElement: DomScrollableElement | undefined;
	private iconIdElement: HTMLElement | undefined;
	private readonly iconContainerWidth = 36;
	private readonly iconContainerHeight = 32;

	constructor(
		private readonly options: IIconSelectBoxOptions,
	) {
		super();
		this.domNode = dom.$('.icon-select-box');
		this._register(this.create());
	}

	private create(): IDisposable {
		const disposables = new DisposableStore();

		const iconSelectBoxContainer = dom.append(this.domNode, dom.$('.icon-select-box-container'));
		iconSelectBoxContainer.style.margin = '10px 15px';

		const iconSelectInputContainer = dom.append(iconSelectBoxContainer, dom.$('.icon-select-input-container'));
		iconSelectInputContainer.style.paddingBottom = '10px';
		this.inputBox = disposables.add(new InputBox(iconSelectInputContainer, undefined, {
			placeholder: localize('iconSelect.placeholder', "Search icons"),
			inputBoxStyles: this.options.inputBoxStyles,
		}));

		const iconsContainer = dom.$('.icon-select-icons-container');
		iconsContainer.style.paddingRight = '10px';
		this.scrollableElement = disposables.add(new DomScrollableElement(iconsContainer, {
			useShadows: false,
			horizontal: ScrollbarVisibility.Hidden,
		}));
		dom.append(iconSelectBoxContainer, this.scrollableElement.getDomNode());
		this.iconIdElement = dom.append(dom.append(iconSelectBoxContainer, dom.$('.icon-select-id-container')), dom.$('.icon-select-id-label'));

		const iconsDisposables = disposables.add(new MutableDisposable());
		iconsDisposables.value = this.renderIcons(this.options.icons, iconsContainer);
		this.scrollableElement.scanDomNode();

		disposables.add(this.inputBox.onDidChange(value => {
			const icons = this.options.icons.filter(icon => {
				return this.matchesContiguous(value, icon.id);
			});
			iconsDisposables.value = this.renderIcons(icons, iconsContainer);
			this.scrollableElement?.scanDomNode();
		}));

		return disposables;
	}

	private renderIcons(icons: ThemeIcon[], container: HTMLElement): IDisposable {
		const disposables = new DisposableStore();
		dom.clearNode(container);
		const focusedIcon = this.renderedIcons[this.focusedItemIndex]?.[0];
		let focusedIconIndex = 0;
		const renderedIcons: [ThemeIcon, HTMLElement][] = [];
		if (icons.length) {
			for (let index = 0; index < icons.length; index++) {
				const icon = icons[index];
				const iconContainer = dom.append(container, dom.$('.icon-container'));
				iconContainer.style.width = `${this.iconContainerWidth}px`;
				iconContainer.style.height = `${this.iconContainerHeight}px`;
				iconContainer.tabIndex = -1;
				iconContainer.role = 'button';
				iconContainer.title = icon.id;
				dom.append(iconContainer, dom.$(ThemeIcon.asCSSSelector(icon)));
				renderedIcons.push([icon, iconContainer]);

				disposables.add(dom.addDisposableListener(iconContainer, dom.EventType.CLICK, (e: MouseEvent) => {
					e.stopPropagation();
					this.setSelection(index);
				}));

				disposables.add(dom.addDisposableListener(iconContainer, dom.EventType.MOUSE_OVER, (e: MouseEvent) => {
					this.focusIcon(index);
				}));

				if (icon === focusedIcon) {
					focusedIconIndex = index;
				}
			}
		} else {
			const noResults = localize('iconSelect.noResults', "No results");
			dom.append(container, dom.$('.icon-no-results', undefined, noResults));
			alert(noResults);
		}

		this.renderedIcons.splice(0, this.renderedIcons.length, ...renderedIcons);
		this.focusIcon(focusedIconIndex);

		return disposables;
	}

	private focusIcon(index: number): void {
		const existing = this.renderedIcons[this.focusedItemIndex];
		if (existing) {
			existing[1].classList.remove('focused');
		}

		this.focusedItemIndex = index;
		const icon = this.renderedIcons[index]?.[1];
		if (icon) {
			icon.classList.add('focused');
		}

		if (this.iconIdElement) {
			this.iconIdElement.textContent = this.renderedIcons[index]?.[0].id;
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
		const icon = this.renderedIcons[index][1];
		if (!icon) {
			return;
		}
		const { height } = this.scrollableElement.getScrollDimensions();
		const { scrollTop } = this.scrollableElement.getScrollPosition();
		if (icon.offsetTop + this.iconContainerHeight > scrollTop + height) {
			this.scrollableElement.setScrollPosition({ scrollTop: icon.offsetTop + this.iconContainerHeight - height });
		} else if (icon.offsetTop < scrollTop) {
			this.scrollableElement.setScrollPosition({ scrollTop: icon.offsetTop });
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
		this.domNode.style.width = `${dimension.width}px`;
		this.domNode.style.height = `${dimension.height}px`;

		const iconsContainerWidth = dimension.width - 40;
		this.numberOfElementsPerRow = Math.floor(iconsContainerWidth / this.iconContainerWidth);
		if (this.numberOfElementsPerRow === 0) {
			throw new Error('Insufficient width');
		}

		const extraSpace = iconsContainerWidth % this.iconContainerWidth;
		const margin = Math.floor(extraSpace / this.numberOfElementsPerRow);
		for (const [, icon] of this.renderedIcons) {
			icon.style.marginRight = `${margin}px`;
		}

		if (this.scrollableElement) {
			this.scrollableElement.getDomNode().style.height = `${dimension.height - 80}px`;
			this.scrollableElement.scanDomNode();
		}
	}

	getFocus(): number[] {
		return [this.focusedItemIndex];
	}

	setSelection(index: number): void {
		if (index < 0 || index >= this.renderedIcons.length) {
			throw new Error(`Invalid index ${index}`);
		}
		this.focusIcon(index);
		this._onDidSelect.fire(this.renderedIcons[index][0]);
	}

	focus(): void {
		this.inputBox?.focus();
		this.focusIcon(0);
	}

	focusNext(): void {
		this.focusIcon((this.focusedItemIndex + 1) % this.renderedIcons.length);
	}

	focusPrevious(): void {
		this.focusIcon((this.focusedItemIndex - 1 + this.renderedIcons.length) % this.renderedIcons.length);
	}

	focusNextRow(): void {
		let nextRowIndex = this.focusedItemIndex + this.numberOfElementsPerRow;
		if (nextRowIndex >= this.renderedIcons.length) {
			nextRowIndex = (nextRowIndex + 1) % this.numberOfElementsPerRow;
		}
		this.focusIcon(nextRowIndex);
	}

	focusPreviousRow(): void {
		let previousRowIndex = this.focusedItemIndex - this.numberOfElementsPerRow;
		if (previousRowIndex < 0) {
			const numberOfRows = Math.floor(this.renderedIcons.length / this.numberOfElementsPerRow);
			previousRowIndex = this.focusedItemIndex + (this.numberOfElementsPerRow * numberOfRows) - 1;
			previousRowIndex = previousRowIndex >= this.renderedIcons.length ? previousRowIndex - this.numberOfElementsPerRow : previousRowIndex;
		}
		this.focusIcon(previousRowIndex);
	}

	getFocusedIcon(): ThemeIcon {
		return this.renderedIcons[this.focusedItemIndex][0];
	}

}
