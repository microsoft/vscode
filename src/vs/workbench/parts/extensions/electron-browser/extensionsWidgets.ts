/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsWidgets';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtension, IExtensionsWorkbenchService } from './extensions';
import { append, emmet as $, addClass } from 'vs/base/browser/dom';

export interface IOptions {
	small?: boolean;
}

export class Label implements IDisposable {

	private listener: IDisposable;

	constructor(
		element: HTMLElement,
		extension: IExtension,
		fn: (extension: IExtension) => string,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		const render = () => element.textContent = fn(extension);
		render();
		this.listener = extensionsWorkbenchService.onChange(render);
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

export class InstallWidget implements IDisposable {

	private disposables: IDisposable[] = [];

	constructor(
		private container: HTMLElement,
		private extension: IExtension,
		private options: IOptions,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		this.disposables.push(extensionsWorkbenchService.onChange(() => this.render()));
		addClass(container, 'extension-install-count');
		this.render();
	}

	private render(): void {
		const installCount = this.extension.installCount;
		this.container.innerHTML = '';

		if (installCount === null) {
			return;
		}

		let installLabel: string;

		if (this.options.small) {
			if (installCount > 1000000) {
				installLabel = `${ Math.floor(installCount / 1000000) }M`;
			} else if (installCount > 1000) {
				installLabel = `${ Math.floor(installCount / 1000) }K`;
			}
		}

		append(this.container, $('span.octicon.octicon-cloud-download'));
		const count = append(this.container, $('span.count'));
		count.textContent = installLabel || String(installCount);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class RatingsWidget implements IDisposable {

	private disposables: IDisposable[] = [];

	constructor(
		private container: HTMLElement,
		private extension: IExtension,
		private options: IOptions,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		this.disposables.push(extensionsWorkbenchService.onChange(() => this.render()));
		addClass(container, 'extension-ratings');

		if (options.small) {
			addClass(container, 'small');
		}

		this.render();
	}

	private render(): void {
		const rating = Math.round(this.extension.rating * 2) / 2;
		this.container.innerHTML = '';

		if (this.extension.rating === null) {
			return;
		}

		if (this.options.small && this.extension.ratingCount === 0) {
			return;
		}

		if (this.options.small) {
			append(this.container, $('span.full.star'));
		} else {
			for (let i = 1; i <= 5; i++) {
				if (rating >= i) {
					append(this.container, $('span.full.star'));
				} else if (rating >= i - 0.5) {
					append(this.container, $('span.half.star'));
				} else {
					append(this.container, $('span.empty.star'));
				}
			}
		}

		const count = append(this.container, $('span.count'));
		count.textContent = String(this.options.small ? rating : this.extension.ratingCount);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
