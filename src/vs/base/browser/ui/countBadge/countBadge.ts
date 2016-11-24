/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./countBadge';
import { $, append } from 'vs/base/browser/dom';
import { format } from 'vs/base/common/strings';

export class CountBadge {

	private element: HTMLElement;
	private count: number;
	private titleFormat: string;

	constructor(container: HTMLElement, count?: number, titleFormat?: string) {
		this.element = append(container, $('.monaco-count-badge'));
		this.titleFormat = titleFormat || '';
		this.setCount(count || 0);
	}

	setCount(count: number) {
		this.count = count;
		this.render();
	}

	setTitleFormat(titleFormat: string) {
		this.titleFormat = titleFormat;
		this.render();
	}

	private render() {
		this.element.textContent = '' + this.count;
		this.element.title = format(this.titleFormat, this.count);
	}
}
