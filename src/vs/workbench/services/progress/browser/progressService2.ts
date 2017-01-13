/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/workbench/services/progress/browser/media/progressService2';
import { always } from 'vs/base/common/async';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/platform';
import { IProgressService2, IProgress, Progress } from 'vs/platform/progress/common/progress';
import { OcticonLabel } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { StatusbarAlignment, IStatusbarRegistry, StatusbarItemDescriptor, Extensions, IStatusbarItem } from 'vs/workbench/browser/parts/statusbar/statusbar';
import { TPromise } from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';


class ProgressItem implements IStatusbarItem {

	static Instance: ProgressItem;

	private _element: HTMLElement;
	private _label: OcticonLabel;

	constructor() {
		ProgressItem.Instance = this;
	}

	render(element: HTMLElement): IDisposable {
		this._element = element;
		this._label = new OcticonLabel(this._element);
		this._element.classList.add('progress');
		this.hide();
		return null;
	}

	set text(value: string) {
		this._label.text = value;
	}

	hide() {
		dom.hide(this._element);
	}

	show() {
		dom.show(this._element);
	}
}


export class ProgressService2 implements IProgressService2 {

	_serviceBrand: any;

	private _stack: Progress<string>[] = [];

	withWindowProgress(task: (progress: IProgress<string>) => TPromise<any>): void {

		const progress = new Progress<string>(() => this._updateProgress());
		this._stack.unshift(progress);

		const promise = task(progress);

		always(promise, () => {
			const idx = this._stack.indexOf(progress);
			this._stack.splice(idx, 1);
			this._updateProgress();
		});
	}

	private _updateProgress() {
		if (this._stack.length === 0) {
			ProgressItem.Instance.hide();
		} else {
			ProgressItem.Instance.show();
			ProgressItem.Instance.text = this._stack[0].value;
		}
	}
}


Registry.as<IStatusbarRegistry>(Extensions.Statusbar).registerStatusbarItem(
	new StatusbarItemDescriptor(ProgressItem, StatusbarAlignment.LEFT)
);
