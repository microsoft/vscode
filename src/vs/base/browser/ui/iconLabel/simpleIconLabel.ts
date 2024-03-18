/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { reset } from 'vs/base/browser/dom';
import { getDefaultHoverDelegate } from 'vs/base/browser/ui/hover/hoverDelegateFactory';
import { ICustomHover, setupCustomHover } from 'vs/base/browser/ui/hover/updatableHoverWidget';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IDisposable } from 'vs/base/common/lifecycle';

export class SimpleIconLabel implements IDisposable {

	private hover?: ICustomHover;

	constructor(
		private readonly _container: HTMLElement
	) { }

	set text(text: string) {
		reset(this._container, ...renderLabelWithIcons(text ?? ''));
	}

	set title(title: string) {
		if (!this.hover && title) {
			this.hover = setupCustomHover(getDefaultHoverDelegate('mouse'), this._container, title);
		} else if (this.hover) {
			this.hover.update(title);
		}
	}

	dispose(): void {
		this.hover?.dispose();
	}
}
