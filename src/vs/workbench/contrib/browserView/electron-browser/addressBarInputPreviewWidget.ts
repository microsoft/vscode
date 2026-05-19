/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, clearNode } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

/**
 * What pressing Enter on the current address bar input would do.
 */
export type AddressBarInputPreview = 'search' | 'url' | undefined;

/**
 * Decorative widget inside the URL bar that previews what action the current
 * address bar input would perform: a magnifying glass for search queries or
 * a globe for URL navigations. Hidden when no preview is set.
 */
export class AddressBarInputPreviewWidget extends Disposable {

	private readonly _container: HTMLElement;
	private readonly _indicator: HTMLElement;

	private _preview: AddressBarInputPreview;

	constructor(parent: HTMLElement) {
		super();

		this._container = $('.browser-address-bar-preview-container');
		this._container.style.display = 'none';

		this._indicator = $('.browser-address-bar-preview-indicator');
		this._indicator.role = 'presentation';
		this._container.appendChild(this._indicator);

		parent.appendChild(this._container);
	}

	setPreview(preview: AddressBarInputPreview): void {
		if (preview === this._preview) {
			return;
		}
		this._preview = preview;
		clearNode(this._indicator);

		if (preview === 'search') {
			this._container.style.display = '';
			this._indicator.appendChild(renderIcon(Codicon.search));
			return;
		}

		if (preview === 'url') {
			this._container.style.display = '';
			this._indicator.appendChild(renderIcon(Codicon.globe));
			return;
		}

		this._container.style.display = 'none';
	}
}
