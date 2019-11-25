/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IView } from 'vs/workbench/common/views';
import { IComposite } from 'vs/workbench/common/composite';
// tslint:disable-next-line: layering
import { ViewPane } from '../browser/parts/views/viewPaneContainer';
import { IViewPaneContainer } from 'vs/workbench/common/viewPaneContainer';

export interface IPaneComposite extends IComposite {
	openView(id: string, focus?: boolean): IView;
	getView(id: string): ViewPane | undefined;
	getViewPaneContainer(): IViewPaneContainer;
}
