/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ITerminalInstance } from './terminal.js';

export interface ITerminalTabsWidget extends IDisposable {
	getHTMLElement(): HTMLElement;
	layout(height: number, width: number): void;
	refresh(cancelEditing?: boolean): void;
	domFocus(): void;
	focusHover(): void;
	getSelection(): number[];
	setSelection(indexes: number[]): void;
	getFocus(): number[];
	setFocus(indexes: number[]): void;
	getSelectedElements(): ITerminalInstance[];
	getFocusedElements(): ITerminalInstance[];
}

export function getSelectedTerminalTabInstances(tabs: ITerminalTabsWidget): ITerminalInstance[] {
	const selection = tabs.getSelectedElements();
	const focused = tabs.getFocusedElements()[0];
	return focused && !selection.includes(focused) ? [focused] : selection;
}
