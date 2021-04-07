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
	private _terminalContainer: HTMLElement | undefined;
	private _terminalTabTree: HTMLElement | undefined;
	private _showTabs: boolean;
	private TAB_TREE_INDEX: number;
	private TERMINAL_CONTAINER_INDEX: number;

	constructor(
		parentElement: HTMLElement,
		@ITerminalService _terminalService: ITerminalService,
		@IConfigurationService _configurationService: IConfigurationService
	) {
		super();
		this._showTabs = _terminalService.configHelper.config.showTabs;
		this.TAB_TREE_INDEX = _terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
		this.TERMINAL_CONTAINER_INDEX = _terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;

		_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.showTabs')) {
				this._showTabs = _terminalService.configHelper.config.showTabs;
				this._updateVisibility();
			} else if (e.affectsConfiguration('terminal.integrated.tabsLocation')) {
				this.TAB_TREE_INDEX = _terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
				this.TERMINAL_CONTAINER_INDEX = _terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;
				this._splitView.swapViews(0, 1);
			}
		});
		this._createSplitView(parentElement);
	}

	private _createSplitView(parentElement: HTMLElement): void {
		if (this._splitView) {
			return;
		}
		this._splitView = new SplitView(parentElement, { orientation: Orientation.HORIZONTAL });
		this._register(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));

		this._terminalContainer = document.createElement('div');
		this._terminalTabTree = document.createElement('div');
		this._configureViews();

		this._splitView.addView({
			element: this._terminalTabTree,
			layout: size => undefined,
			minimumSize: 80,
			maximumSize: 300,
			onDidChange: () => Disposable.None,
		}, Sizing.Distribute, this.TAB_TREE_INDEX);


		this._splitView.addView({
			element: this._terminalContainer,
			layout: size => undefined,
			minimumSize: 800,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None
		}, Sizing.Distribute, this.TERMINAL_CONTAINER_INDEX);

		this._updateVisibility();
	}

	private _updateVisibility() {
		if (!this._splitView) {
			return;
		}
		this._splitView.setViewVisible(this.TAB_TREE_INDEX, this._showTabs);
		this._splitView.setViewVisible(this.TERMINAL_CONTAINER_INDEX, true);
	}

	private _configureViews(): void {
		this._terminalTabTree!.innerText = 'Tab tree';
		this._terminalContainer!.innerText = 'Terminal container';
	}

	layout(width: number): void {
		this._splitView.layout(width);
	}
}
