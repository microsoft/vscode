/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IView, IViewPaneContainer } from 'vs/workbench/common/views';
import { IComposite } from 'vs/workbench/common/composite';

export interface IPaneComposite extends IComposite {
	openView(id: string, focus?: boolean): IView;
	getViewPaneContainer(): IViewPaneContainer;
	saveState(): void;
}
