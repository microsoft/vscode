/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContentActionHandler } from 'vs/base/browser/formattedTextRenderer';
import { IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { IListStyles } from 'vs/base/browser/ui/list/listWidget';
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
	selectBackground: string | undefined;
	selectListBackground: string | undefined;
	selectForeground: string | undefined;
	decoratorRightForeground: string | undefined;
	selectBorder: string | undefined;
	selectListBorder: string | undefined;
	focusBorder: string | undefined;
}

export const unthemedSelectBoxStyles: ISelectBoxStyles = {
	selectBackground: '#3C3C3C',
	selectForeground: '#F0F0F0',
	selectBorder: '#3C3C3C',
	decoratorRightForeground: undefined,
	selectListBackground: undefined,
	selectListBorder: undefined,
	focusBorder: undefined,
	listBackground: undefined,
	listFocusBackground: undefined,
	listFocusForeground: undefined,
	listActiveSelectionBackground: undefined,
	listActiveSelectionForeground: undefined,
	listActiveSelectionIconForeground: undefined,
	listFocusAndSelectionOutline: undefined,
	listFocusAndSelectionBackground: undefined,
	listFocusAndSelectionForeground: undefined,
	listInactiveSelectionBackground: undefined,
	listInactiveSelectionIconForeground: undefined,
	listInactiveSelectionForeground: undefined,
	listInactiveFocusForeground: undefined,
	listInactiveFocusBackground: undefined,
	listHoverBackground: undefined,
	listHoverForeground: undefined,
	listDropBackground: undefined,
	listFocusOutline: undefined,
	listInactiveFocusOutline: undefined,
	listSelectionOutline: undefined,
	listHoverOutline: undefined,
	treeIndentGuidesStroke: undefined,
	treeInactiveIndentGuidesStroke: undefined,
	tableColumnsBorder: undefined,
	tableOddRowsBackgroundColor: undefined
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

	render(container: HTMLElement): void {
		this.selectBoxDelegate.render(container);
	}
}
