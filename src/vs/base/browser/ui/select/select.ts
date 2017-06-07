/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./select';

import {Builder} from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import {Widget} from 'vs/base/browser/ui/widget';

let $ = dom.emmet;

export interface SelectOption {
	value: string;
	display: string;
}

export interface ISelectOpts {
	className: string;
	options?: SelectOption[];
	defaultOption: SelectOption;
	onChange: (value: string) => void;
}

export class Select extends Widget {

	/*protected*/ $el: Builder;
	private _opts: ISelectOpts;
	public select: HTMLSelectElement;
	private element: HTMLElement;

	constructor(container: HTMLElement, opts: ISelectOpts) {
		super();
		this._opts = opts;

		this.element = dom.append(container, $('.select.tick'));

		this.select = <HTMLSelectElement>dom.append(this.element, $('select'));
		this.select.className = this._opts.className;

		let option1 = <HTMLOptionElement>dom.append(this.select, $('option'));
		option1.setAttribute('value', opts.defaultOption.value);
		option1.text = opts.defaultOption.display;

		this.setOptions(opts.options, false);
	}

	public get options() {
		return this._opts.options;
	}

	public setOptions(options: SelectOption[], clear: boolean = false) {
		if (clear) {
			dom.clearNode(this.select);
		}
		if (options !== undefined && options.length !== 0) {
			this._opts.options = options;
			for (var i = 0; i < options.length; i++) {
				var option = options[i];
				let optionElement = <HTMLOptionElement>dom.append(this.select, $('option'));
				optionElement.setAttribute('value', option.value);
				optionElement.text = option.display;
			}
		}

		this.onchange(this.select, (e) => {
			this._opts.onChange(this.select.value);
		});
	}

	public hide() {
		this.element.hidden = true;
	}

	public show() {
		this.element.hidden = false;
	}
}