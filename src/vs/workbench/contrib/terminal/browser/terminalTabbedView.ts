/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalTabbedView extends Disposable {
	private _splitView!: SplitView;
	private _parentElement: HTMLElement;
	private _terminalContainer: HTMLElement | undefined;
	private _terminalTabTree: HTMLElement | undefined;
	private _displayTabs: boolean;
	constructor(
		parentElement: HTMLElement,
		@ITerminalService _terminalService: ITerminalService,
		@IConfigurationService _configurationService: IConfigurationService
	) {
		super();
		this._parentElement = parentElement;
		this._displayTabs = _terminalService.configHelper.config.showTabs;
		this._createSplitView();

		_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.showTabs')) {
				this._displayTabs = _terminalService.configHelper.config.showTabs;
			}
		});
	}

	private _createSplitView(): void {
		if (this._splitView) {
			return;
		}
		this._splitView = new SplitView(this._parentElement, { orientation: Orientation.HORIZONTAL });

		this._terminalContainer = document.createElement('div');
		this._terminalContainer.innerText = 'Hi';
		this._terminalTabTree = document.createElement('div');
		this._terminalTabTree.innerText = 'Hello';

		if (this._displayTabs) {
			this._splitView.addView({
				element: this._terminalTabTree,
				layout: size => this._layout(size),
				minimumSize: 220,
				maximumSize: Number.POSITIVE_INFINITY,
				onDidChange: () => Disposable.None
			}, Sizing.Distribute);
		}
		this._splitView.addView({
			element: this._terminalContainer,
			layout: size => this._layout(size),
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None
		}, Sizing.Distribute);
	}
	private _layout(size: number): void {

	}
}
