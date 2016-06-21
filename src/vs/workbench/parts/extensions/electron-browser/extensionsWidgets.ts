/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsWidgets';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtension, ExtensionsModel } from './extensionsModel';
import { append, emmet as $, addClass } from 'vs/base/browser/dom';

export interface IOptions {
	small?: boolean;
}

export class RatingsWidget implements IDisposable {

	static ID: string = 'workbench.editor.extension';

	private element: HTMLElement;
	private disposables: IDisposable[] = [];

	constructor(
		container: HTMLElement,
		private model: ExtensionsModel,
		private extension: IExtension,
		options: IOptions = {}
	) {
		this.disposables.push(this.model.onChange(() => this.render()));
		this.element = append(container, $('span.extension-ratings'));

		if (options.small) {
			addClass(this.element, 'small');
		}

		this.render();
	}

	private render(): void {
		const rating = this.extension.rating;
		this.element.innerHTML = '';

		if (rating === null) {
			return;
		}

		for (let i = 1; i <= 5; i++) {
			if (rating >= i) {
				append(this.element, $('span.full.star'));
			} else if (rating >= i - 0.5) {
				append(this.element, $('span.half.star'));
			} else {
				append(this.element, $('span.empty.star'));
			}
		}

		const count = append(this.element, $('span.count'));
		count.textContent = String(this.extension.ratingCount);
	}

	dispose(): void {
		this.element.parentElement.removeChild(this.element);
		this.disposables = dispose(this.disposables);
	}
}
