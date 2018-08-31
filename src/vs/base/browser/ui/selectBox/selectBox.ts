/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./selectBox';

import { Event } from 'vs/base/common/event';
import { Widget } from 'vs/base/browser/ui/widget';
import { Color } from 'vs/base/common/color';
import { deepClone, mixin } from 'vs/base/common/objects';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
import { SelectBoxNative } from 'vs/base/browser/ui/selectBox/selectBoxNative';
import { SelectBoxList } from 'vs/base/browser/ui/selectBox/selectBoxCustom';
import { isMacintosh } from 'vs/base/common/platform';
import { IContentActionHandler } from 'vs/base/browser/htmlContentRenderer';

// Public SelectBox interface - Calls routed to appropriate select implementation class

export interface ISelectBoxDelegate {

	// Public SelectBox Interface
	readonly onDidSelect: Event<ISelectData>;
	setOptions(options: string[], selected?: number, disabled?: number): void;
	select(index: number): void;
	setAriaLabel(label: string);
	setDetailsProvider(provider: (index: number) => { details: string, isMarkdown: boolean });
	focus(): void;
	blur(): void;
	dispose(): void;

	// Delegated Widget interface
	render(container: HTMLElement): void;
	style(styles: ISelectBoxStyles): void;
	applyStyles(): void;
}

export interface ISelectBoxOptions {
	ariaLabel?: string;
	minBottomMargin?: number;
	hasDetails?: boolean;
	markdownActionHandler?: IContentActionHandler;
}

export interface ISelectBoxStyles extends IListStyles {
	selectBackground?: Color;
	selectListBackground?: Color;
	selectForeground?: Color;
	selectBorder?: Color;
	selectListBorder?: Color;
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
	private styles: ISelectBoxStyles;
	private selectBoxDelegate: ISelectBoxDelegate;

	constructor(options: string[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles = deepClone(defaultStyles), selectBoxOptions?: ISelectBoxOptions) {
		super();

		mixin(this.styles, defaultStyles, false);

		// Instantiate select implementation based on platform
		if (isMacintosh && !(selectBoxOptions && selectBoxOptions.hasDetails)) {
			this.selectBoxDelegate = new SelectBoxNative(options, selected, styles, selectBoxOptions);
		} else {
			this.selectBoxDelegate = new SelectBoxList(options, selected, contextViewProvider, styles, selectBoxOptions);
		}

		this._register(this.selectBoxDelegate);
	}

	// Public SelectBox Methods - routed through delegate interface

	public get onDidSelect(): Event<ISelectData> {
		return this.selectBoxDelegate.onDidSelect;
	}

	public setOptions(options: string[], selected?: number, disabled?: number): void {
		this.selectBoxDelegate.setOptions(options, selected, disabled);
	}

	public select(index: number): void {
		this.selectBoxDelegate.select(index);
	}

	public setAriaLabel(label: string): void {
		this.selectBoxDelegate.setAriaLabel(label);
	}

	public setDetailsProvider(provider: (index: number) => { details: string, isMarkdown: boolean }): void {
		this.selectBoxDelegate.setDetailsProvider(provider);
	}

	public focus(): void {
		this.selectBoxDelegate.focus();
	}

	public blur(): void {
		this.selectBoxDelegate.blur();
	}

	// Public Widget Methods - routed through delegate interface

	public render(container: HTMLElement): void {
		this.selectBoxDelegate.render(container);
	}

	public style(styles: ISelectBoxStyles): void {
		this.selectBoxDelegate.style(styles);
	}

	public applyStyles(): void {
		this.selectBoxDelegate.applyStyles();
	}
}