/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from 'vs/base/browser/dom';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegate';
import { ICustomHover, setupCustomHover } from 'vs/base/browser/ui/iconLabel/iconLabelHover';
import { format } from 'vs/base/common/strings';
import 'vs/css!./countBadge';

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

export class CountBadge {

	private element: HTMLElement;
	private count: number = 0;
	private countFormat: string;
	private titleFormat: string;
	private hover: ICustomHover | undefined;

	constructor(container: HTMLElement, private readonly options: ICountBadgeOptions, private readonly styles: ICountBadgeStyles) {

		this.element = append(container, $('.monaco-count-badge'));
		this.countFormat = this.options.countFormat || '{0}';
		this.titleFormat = this.options.titleFormat || '';
		this.setCount(this.options.count || 0);
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
		this.render();
	}

	private render() {
		this.element.textContent = format(this.countFormat, this.count);

		const title = format(this.titleFormat, this.count);
		if (!this.hover) {
			this.hover = setupCustomHover(getDefaultHoverDelegate('mouse'), this.element, title);
		} else {
			this.hover.update(title);
		}

		this.element.style.backgroundColor = this.styles.badgeBackground ?? '';
		this.element.style.color = this.styles.badgeForeground ?? '';

		if (this.styles.badgeBorder) {
			this.element.style.border = `1px solid ${this.styles.badgeBorder}`;
		}
	}
}
