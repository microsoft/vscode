/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';


export class TabsView {
	private _splitView: SplitView | undefined;
	private _widget: WorkbenchObjectTree<any> | undefined;

	constructor(
		context: string,
		container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalService private readonly _terminalService: ITerminalService,

	) {
		if (context === 'terminal') {
			this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });
			this._widget = _instantiationService.createInstance(TerminalTabsWidget, this._splitView.el);
		}
	}

	public layout(width: number, height: number): void {
		this._splitView?.layout(width);
		this._terminalService.terminalTabs.forEach(t => t.layout(width - 20, height));
	}
}
