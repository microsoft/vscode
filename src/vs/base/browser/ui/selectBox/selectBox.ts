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

	private select: HTMLSelectElement;
	private options: string[];
	private selected: number;
	private container: HTMLElement;
	private _onDidSelect: Emitter<string>;
	private toDispose: IDisposable[];

	constructor(options: string[], selected: number) {
		super();

		this.select = document.createElement('select');
		this.select.className = 'select-box';

		this.options = options;
		this.selected = selected;
		this.toDispose = [];
		this._onDidSelect = new Emitter<string>();

		this.toDispose.push(dom.addStandardDisposableListener(this.select, 'change', (e) => {
			this._onDidSelect.fire(e.target.value);
		}));
	}

	public get onDidSelect(): Event<string> {
		return this._onDidSelect.event;
	}

	public setOptions(options: string[], selected: number): void {
		this.options = options;
		if (selected >= 0) {
			this.selected = selected;
		} else if (this.selected < 0 || this.selected > this.options.length) {
			this.selected = 0;
		}

		this.doSetOptions();
	}

	public focus(): void {
		if (this.select) {
			this.select.focus();
		}
	}

	public set enabled(value: boolean) {
		dom.toggleClass(this.container, 'disabled', !value);
		this.select.disabled = !value;
	}

	public blur(): void {
		if (this.select) {
			this.select.blur();
		}
	}

	public render(container: HTMLElement): void {
		this.container = container;
		dom.addClass(container, 'select-container');
		container.appendChild(this.select);
		this.doSetOptions();
	}

	public getSelected(): string {
		return this.options && this.selected >= 0 && this.selected < this.options.length ? this.options[this.selected] : null;
	}

	private doSetOptions(): void {
		this.select.options.length = 0;

		this.options.forEach((option) => {
			this.select.add(this.createOption(option));
		});

		if (this.selected >= 0) {
			this.select.selectedIndex = this.selected;
			this.select.title = this.options[this.selected];
		}
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