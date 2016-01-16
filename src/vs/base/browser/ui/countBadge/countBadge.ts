/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./countBadge';
import {Builder, $} from 'vs/base/browser/builder';
import strings = require('vs/base/common/strings');

export class CountBadge {

	private $el: Builder;
	private count: number;
	private titleFormat: string;

	constructor(container: Builder, count?: number, titleFormat?: string);
	constructor(container: HTMLElement, count?: number, titleFormat?: string);
	constructor(container: any, count?: number, titleFormat?: string) {
		this.$el = $('.monaco-count-badge').appendTo(container);
		this.titleFormat = titleFormat || '';
		this.setCount(count || 0);
	}

	public setCount(count: number) {
		this.count = count;
		this.render();
	}

	public setTitleFormat(titleFormat: string) {
		this.titleFormat = titleFormat;
		this.render();
	}

	private render() {
		this.$el.text('' + this.count);
		this.$el.title(strings.format(this.titleFormat, this.count));
	}

	public dispose() {
		if (this.$el) {
			this.$el.destroy();
			this.$el = null;
		}
	}
}
