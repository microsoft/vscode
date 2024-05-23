/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContentActionHandler } from 'vs/base/browser/formattedTextRenderer';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListStyles, unthemedListStyles } from 'vs/base/browser/ui/list/listWidget';
import { SelectBoxList } from 'vs/base/browser/ui/selectBox/selectBoxCustom';
import { SelectBoxNative } from 'vs/base/browser/ui/selectBox/selectBoxNative';
import { Widget } from 'vs/base/browser/ui/widget';
import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isMacintosh } from 'vs/base/common/platform';
import 'vs/css!./selectBox';



// Public SelectBox interface - Calls routed to appropriate select implementation class

export interface ISelectBoxDelegate extends IDisposable {

	// Public SelectBox Interface
	readonly onDidSelect: Event<ISelectData>;
	setOptions(options: ISelectOptionItem[], selected?: number): void;
	select(index: number): void;
	setAriaLabel(label: string): void;
	focus(): void;
	blur(): void;
	setFocusable(focus: boolean): void;
	setEnabled(enabled: boolean): void;

	// Delegated Widget interface
	render(container: HTMLElement): void;
}

export interface ISelectBoxOptions {
	useCustomDrawn?: boolean;
	ariaLabel?: string;
	ariaDescription?: string;
	minBottomMargin?: number;
	optionsAsChildren?: boolean;
}

// Utilize optionItem interface to capture all option parameters
export interface ISelectOptionItem {
	text: string;
	detail?: string;
	decoratorRight?: string;
	description?: string;
	descriptionIsMarkdown?: boolean;
	descriptionMarkdownActionHandler?: IContentActionHandler;
	isDisabled?: boolean;
}

export interface ISelectBoxStyles extends IListStyles {
	readonly selectBackground: string | undefined;
	readonly selectListBackground: string | undefined;
	readonly selectForeground: string | undefined;
	readonly decoratorRightForeground: string | undefined;
	readonly selectBorder: string | undefined;
	readonly selectListBorder: string | undefined;
	readonly focusBorder: string | undefined;
}

export const unthemedSelectBoxStyles: ISelectBoxStyles = {
	...unthemedListStyles,
	selectBackground: '#3C3C3C',
	selectForeground: '#F0F0F0',
	selectBorder: '#3C3C3C',
	decoratorRightForeground: undefined,
	selectListBackground: undefined,
	selectListBorder: undefined,
	focusBorder: undefined,
};

export interface ISelectData {
	selected: string;
	index: number;
}

export class SelectBox extends Widget implements ISelectBoxDelegate {
	private selectBoxDelegate: ISelectBoxDelegate;

	constructor(options: ISelectOptionItem[], selected: number, contextViewProvider: IContextViewProvider, styles: ISelectBoxStyles, selectBoxOptions?: ISelectBoxOptions) {
		super();

		// Default to native SelectBox for OSX unless overridden
		if (isMacintosh && !selectBoxOptions?.useCustomDrawn) {
			this.selectBoxDelegate = new SelectBoxNative(options, selected, styles, selectBoxOptions);
		} else {
			this.selectBoxDelegate = new SelectBoxList(options, selected, contextViewProvider, styles, selectBoxOptions);
		}

		this._register(this.selectBoxDelegate);
	}

	// Public SelectBox Methods - routed through delegate interface

	get onDidSelect(): Event<ISelectData> {
		return this.selectBoxDelegate.onDidSelect;
	}

	setOptions(options: ISelectOptionItem[], selected?: number): void {
		this.selectBoxDelegate.setOptions(options, selected);
	}

	select(index: number): void {
		this.selectBoxDelegate.select(index);
	}

	setAriaLabel(label: string): void {
		this.selectBoxDelegate.setAriaLabel(label);
	}

	focus(): void {
		this.selectBoxDelegate.focus();
	}

	blur(): void {
		this.selectBoxDelegate.blur();
	}

	setFocusable(focusable: boolean): void {
		this.selectBoxDelegate.setFocusable(focusable);
	}

	setEnabled(enabled: boolean): void {
		this.selectBoxDelegate.setEnabled(enabled);
	}

	render(container: HTMLElement): void {
		this.selectBoxDelegate.render(container);
	}
}
