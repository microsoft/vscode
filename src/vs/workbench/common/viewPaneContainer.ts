/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, IActionViewItem } from 'vs/base/common/actions';

export interface IViewPaneContainer {
	setVisible(visible: boolean): void;
	isVisible(): boolean;
	focus(): void;
	getActions(): IAction[];
	getSecondaryActions(): IAction[];
	getActionViewItem(action: IAction): IActionViewItem | undefined;
	saveState(): void;
}
