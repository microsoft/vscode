/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';

export class SelectBox extends Widget {

	private selectElement: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private container: HTMLElement;
	private _onDidSelect: Emitter<string>;
	private toDispose: IDisposable[];

	constructor(options: string[], selected: number) {
		super();

		this.selectElement = document.createElement('select');
		this.selectElement.className = 'select-box';

		this.options = options;
		this.selected = selected;
		this.toDispose = [];
		this._onDidSelect = new Emitter<string>();

		this.toDispose.push(dom.addStandardDisposableListener(this.selectElement, 'change', (e) => {
			this.selectElement.title = e.target.value;
			this._onDidSelect.fire(e.target.value);
		}));
	}

	public get onDidSelect(): Event<string> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected: number): void {
		this.options = options;

		this.selectElement.options.length = 0;
		this.options.forEach((option) => {
			this.selectElement.add(this.createOption(option));
		});
		this.select(selected);
	}

	public select(index: number): void {
		if (index >= 0 && index < this.options.length) {
			this.selected = index;
		} else if (this.selected < 0) {
			this.selected = 0;
		}

		this.selectElement.selectedIndex = this.selected;
		this.selectElement.title = this.options[this.selected];
	}

	public focus(): void {
		if (this.selectElement) {
			this.selectElement.focus();
		}
	}

	public set enabled(value: boolean) {
		dom.toggleClass(this.container, 'disabled', !value);
		this.selectElement.disabled = !value;
	}

	public get enabled(): boolean {
		return !this.selectElement.disabled;
	}

	public blur(): void {
		if (this.selectElement) {
			this.selectElement.blur();
		}
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'select-container');
		container.appendChild(this.selectElement);
		this.setOptions(this.options, this.selected);
	}

	private createOption(value: string): HTMLOptionElement {
		let option = document.createElement('option');
		option.value = value;
		option.text = value;

		return option;
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}