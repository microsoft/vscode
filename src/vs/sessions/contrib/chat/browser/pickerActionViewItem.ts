/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { HorizontalRovingActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export interface IPickerActionViewItemWidget extends IDisposable {
	readonly actionBarFocusElements: readonly HTMLElement[];
	readonly onDidChangeActionBarFocusElements?: Event<void>;
	render(container: HTMLElement): void;
}

export class PickerActionViewItem extends HorizontalRovingActionViewItem {

	constructor(
		private readonly picker: IPickerActionViewItemWidget,
		disposable?: IDisposable,
		private readonly classNames: readonly string[] = [],
	) {
		super(undefined, { id: '', label: '', enabled: true, class: undefined, tooltip: '', run: () => { } });
		if (disposable) {
			this._register(disposable);
		}
		if (picker.onDidChangeActionBarFocusElements) {
			this._register(picker.onDidChangeActionBarFocusElements(() => this.refreshRovingFocusElements()));
		}
	}

	protected getRovingFocusElements(): readonly HTMLElement[] {
		return this.picker.actionBarFocusElements;
	}

	override isEnabled(): boolean {
		return this.picker.actionBarFocusElements.length > 0;
	}

	override render(container: HTMLElement): void {
		container.classList.add(...this.classNames);
		this.picker.render(container);
		this.registerRovingFocus(container);
	}

	override dispose(): void {
		this.picker.dispose();
		super.dispose();
	}
}
