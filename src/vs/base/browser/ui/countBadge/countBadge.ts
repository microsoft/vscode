/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../dom.js';
import { format } from '../../../common/strings.js';
import './countBadge.css';
import { Disposable, IDisposable, MutableDisposable, toDisposable } from '../../../common/lifecycle.js';
import { getBaseLayerHoverDelegate } from '../hover/hoverDelegate2.js';

export interface ICountBadgeOptions {
	readonly count?: number;
	readonly countFormat?: string;
	readonly titleFormat?: string;
}

export interface ICountBadgeStyles {
	readonly badgeBackground: string | undefined;
	readonly badgeForeground: string | undefined;
	readonly badgeBorder: string | undefined;
}

export const unthemedCountStyles: ICountBadgeStyles = {
	badgeBackground: '#4D4D4D',
	badgeForeground: '#FFFFFF',
	badgeBorder: undefined
};

export class CountBadge extends Disposable {

	private element: HTMLElement;
	private count: number = 0;
	private countFormat: string;
	private titleFormat: string;
	private readonly hover = this._register(new MutableDisposable<IDisposable>());

	constructor(container: HTMLElement, private readonly options: ICountBadgeOptions, private readonly styles: ICountBadgeStyles) {

		super();
		this.element = append(container, $('.monaco-count-badge'));
		this._register(toDisposable(() => container.removeChild(this.element)));
		this.countFormat = this.options.countFormat || '{0}';
		this.titleFormat = this.options.titleFormat || '';
		this.setCount(this.options.count || 0);
		this.updateHover();
	}

	setCount(count: number) {
		this.count = count;
		this.render();
	}

	setCountFormat(countFormat: string) {
		this.countFormat = countFormat;
		this.render();
	}

	setTitleFormat(titleFormat: string) {
		this.titleFormat = titleFormat;
		this.updateHover();
		this.render();
	}

	private updateHover(): void {
		if (this.titleFormat !== '' && !this.hover.value) {
			this.hover.value = getBaseLayerHoverDelegate().setupDelayedHoverAtMouse(this.element, () => ({ content: format(this.titleFormat, this.count), appearance: { compact: true } }));
		} else if (this.titleFormat === '' && this.hover.value) {
			this.hover.value = undefined;
		}
	}

	private render() {
		this.element.textContent = format(this.countFormat, this.count);

		this.element.style.backgroundColor = this.styles.badgeBackground ?? '';
		this.element.style.color = this.styles.badgeForeground ?? '';

		if (this.styles.badgeBorder) {
			this.element.style.border = `1px solid ${this.styles.badgeBorder}`;
		}
	}
}
