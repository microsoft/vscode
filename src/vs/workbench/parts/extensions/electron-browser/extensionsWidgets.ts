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

export class Label implements IDisposable {

	private listener: IDisposable;

	constructor(
		element: HTMLElement,
		model: ExtensionsModel,
		extension: IExtension,
		fn: (extension: IExtension) => string
	) {
		const render = () => element.textContent = fn(extension);
		render();
		this.listener = model.onChange(render);
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

export class RatingsWidget implements IDisposable {

	static ID: string = 'workbench.editor.extension';

	private disposables: IDisposable[] = [];

	constructor(
		private container: HTMLElement,
		private model: ExtensionsModel,
		private extension: IExtension,
		options: IOptions = {}
	) {
		this.disposables.push(this.model.onChange(() => this.render()));
		addClass(container, 'extension-ratings');

		if (options.small) {
			addClass(container, 'small');
		}

		this.render();
	}

	private render(): void {
		const rating = this.extension.rating;
		this.container.innerHTML = '';

		if (rating === null) {
			return;
		}

		for (let i = 1; i <= 5; i++) {
			if (rating >= i) {
				append(this.container, $('span.full.star'));
			} else if (rating >= i - 0.5) {
				append(this.container, $('span.half.star'));
			} else {
				append(this.container, $('span.empty.star'));
			}
		}

		const count = append(this.container, $('span.count'));
		count.textContent = String(this.extension.ratingCount);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
