/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { deepClone, mixin } from 'vs/base/common/objects';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { SelectBoxNative } from 'vs/base/browser/ui/selectBox/selectBoxNative';
import { SelectBoxList } from 'vs/base/browser/ui/selectBox/selectBoxList';

// Public SelectBox interface - Calls routed to appropriate select implementation class
export interface ISelectBoxDelegate {
	// Public SelectBox Interface
	readonly onDidSelect: Event<ISelectData>;
	setOptions(options: string[], selected?: number, disabled?: number): void;
	select(index: number): void;
	focus(): void;
	blur(): void;

	// Delegated Widget interface
	render(container: HTMLElement): void;
	style(styles: ISelectBoxStyles): void;
	applyStyles(): void;
}

export interface ISelectBoxStyles extends IListStyles {
	selectBackground?: Color;
	selectForeground?: Color;
	selectBorder?: Color;
	focusBorder?: Color;
}

export const defaultStyles = {
	selectBackground: Color.fromHex('#3C3C3C'),
	selectForeground: Color.fromHex('#F0F0F0'),
	selectBorder: Color.fromHex('#3C3C3C')
};

export interface ISelectData {
	selected: string;
	index: number;
}

export class SelectBox extends Widget implements ISelectBoxDelegate {

	private _useNativeSelect: boolean;
	private toDispose: IDisposable[];
	private styles: ISelectBoxStyles;
	private selectBoxDelegate: SelectBoxNative | SelectBoxList;

	constructor(options: string[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles = deepClone(defaultStyles)) {
		super();

		this._useNativeSelect = false;
		this.toDispose = [];

		// Hardcode native select switch based on platform
		switch (process.platform) {
			case 'darwin':
				this._useNativeSelect = true;
				break;
			case 'win32':
			default:
				this._useNativeSelect = false;
				break;
		}

		mixin(this.styles, defaultStyles, false);

		// Instantiate select implementation based on platform
		if (this._useNativeSelect) {
			this.selectBoxDelegate = new SelectBoxNative(options, selected, styles, this.toDispose);
		} else {
			this.selectBoxDelegate = new SelectBoxList(options, selected, contextViewProvider, styles, this.toDispose);
		}
	}

	// Public SelectBox Methods - routed through delegate interface

	public get onDidSelect(): Event<ISelectData> {
		if (!this.selectBoxDelegate) {
			return null;
		}
		return this.selectBoxDelegate.onDidSelect;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.setOptions(options, selected, disabled);
	}

	public select(index: number): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.select(index);
	}

	public focus(): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.focus();
	}

	public blur(): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.blur();
	}

	// Public Widget Methods - routed through delegate interface

	public render(container: HTMLElement): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.render(container);
	}

	public style(styles: ISelectBoxStyles): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.style(styles);
	}

	public applyStyles(): void {
		if (!this.selectBoxDelegate) {
			return null;
		}
		this.selectBoxDelegate.applyStyles();
	}

	public dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}