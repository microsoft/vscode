/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import * as DOM from 'vs/base/browser/dom';
import { MenuEntryActionViewItem } from 'vs/platform/actions/browser/menuEntryActionViewItem';

export class CodiconActionViewItem extends MenuEntryActionViewItem {

	override updateLabel(): void {
		if (this.options.label && this.label) {
			DOM.reset(this.label, ...renderLabelWithIcons(this._commandAction.label ?? ''));
		}
	}
}

export class ActionViewWithLabel extends MenuEntryActionViewItem {
	private _actionLabel?: HTMLAnchorElement;

	override render(container: HTMLElement): void {
		super.render(container);
		container.classList.add('notebook-action-view-item');
		this._actionLabel = document.createElement('a');
		container.appendChild(this._actionLabel);
		this.updateLabel();
	}

	override updateLabel() {
		if (this._actionLabel) {
			this._actionLabel.classList.add('notebook-label');
			this._actionLabel.innerText = this._action.label;
			this._actionLabel.title = this._action.tooltip.length ? this._action.tooltip : this._action.label;
		}
	}
}
