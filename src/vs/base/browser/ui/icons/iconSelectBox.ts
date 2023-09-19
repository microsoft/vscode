/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./iconSelectBox';
import * as dom from 'vs/base/browser/dom';
import { IInputBoxStyles, InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Emitter } from 'vs/base/common/event';
import { IDisposable, DisposableStore, Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { localize } from 'vs/nls';
import { IMatch } from 'vs/base/common/filters';

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
		this.scrollableElement = disposables.add(new DomScrollableElement(iconsContainer, { useShadows: false }));
		dom.append(iconSelectBoxContainer, this.scrollableElement.getDomNode());

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
		if (icon.offsetTop > scrollTop + height || icon.offsetTop < scrollTop) {
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
		if (this.scrollableElement) {
			this.scrollableElement.getDomNode().style.height = `${dimension.height - 46}px`;
			this.scrollableElement.scanDomNode();
		}

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
		this.focusIcon((this.focusedItemIndex + this.numberOfElementsPerRow) % this.renderedIcons.length);
	}

	focusPreviousRow(): void {
		this.focusIcon((this.focusedItemIndex - this.numberOfElementsPerRow + this.renderedIcons.length) % this.renderedIcons.length);
	}

	getFocusedIcon(): ThemeIcon {
		return this.renderedIcons[this.focusedItemIndex][0];
	}

}
