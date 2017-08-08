/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsWidgets';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions';
import { append, $, addClass } from 'vs/base/browser/dom';
import * as platform from 'vs/base/common/platform';

export interface IOptions {
	extension?: IExtension;
	small?: boolean;
}

export class Label implements IDisposable {

	private listener: IDisposable;
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.render(); }

	constructor(
		private element: HTMLElement,
		private fn: (extension: IExtension) => string,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		this.render();
		this.listener = extensionsWorkbenchService.onChange(this.render, this);
	}

	private render(): void {
		this.element.textContent = this.extension ? this.fn(this.extension) : '';
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

export class InstallWidget implements IDisposable {

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.render(); }

	constructor(
		private container: HTMLElement,
		private options: IOptions,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		this._extension = options.extension;
		this.disposables.push(extensionsWorkbenchService.onChange(() => this.render()));
		addClass(container, 'extension-install-count');
		this.render();
	}

	private render(): void {
		this.container.innerHTML = '';

		if (!this.extension) {
			return;
		}

		const installCount = this.extension.installCount;

		if (installCount === null) {
			return;
		}

		let installLabel: string;

		if (this.options.small) {
			if (installCount > 1000000) {
				installLabel = `${Math.floor(installCount / 100000) / 10}M`;
			} else if (installCount > 1000) {
				installLabel = `${Math.floor(installCount / 1000)}K`;
			} else {
				installLabel = String(installCount);
			}
		}
		else {
			installLabel = installCount.toLocaleString(platform.locale);
		}

		append(this.container, $('span.octicon.octicon-cloud-download'));
		const count = append(this.container, $('span.count'));
		count.textContent = installLabel;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class RatingsWidget implements IDisposable {

	private disposables: IDisposable[] = [];
	private _extension: IExtension;
	get extension(): IExtension { return this._extension; }
	set extension(extension: IExtension) { this._extension = extension; this.render(); }

	constructor(
		private container: HTMLElement,
		private options: IOptions,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		this._extension = options.extension;
		this.disposables.push(extensionsWorkbenchService.onChange(() => this.render()));
		addClass(container, 'extension-ratings');

		if (options.small) {
			addClass(container, 'small');
		}

		this.render();
	}

	private render(): void {
		this.container.innerHTML = '';

		if (!this.extension) {
			return;
		}

		const rating = Math.round(this.extension.rating * 2) / 2;

		if (this.extension.rating === null) {
			return;
		}

		if (this.options.small && this.extension.ratingCount === 0) {
			return;
		}

		if (this.options.small) {
			append(this.container, $('span.full.star'));

			const count = append(this.container, $('span.count'));
			count.textContent = String(rating);
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
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
