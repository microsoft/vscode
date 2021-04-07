/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Orientation, Sizing, SplitView } from 'vs/base/browser/ui/splitview/splitview';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalTabsWidget } from 'vs/workbench/contrib/terminal/browser/terminalTabsWidget';

export class TerminalTabbedView extends Disposable {

	private _splitView!: SplitView;
	private _terminalContainer: HTMLElement;
	private _terminalTabTree: HTMLElement;
	private _showTabs: boolean;
	private TAB_TREE_INDEX: number;
	private TERMINAL_CONTAINER_INDEX: number;
	private _tabsWidget: TerminalTabsWidget | undefined;
	private _instantiationService: IInstantiationService;
	private _terminalService: ITerminalService;
	private _height: number | undefined;

	constructor(
		parentElement: HTMLElement,
		@ITerminalService terminalService: ITerminalService,
		@IConfigurationService _configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();
		this._instantiationService = instantiationService;
		this._showTabs = terminalService.configHelper.config.showTabs;
		this.TAB_TREE_INDEX = terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
		this.TERMINAL_CONTAINER_INDEX = terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;
		this._terminalTabTree = document.createElement('div');
		this._terminalTabTree.classList.add('tabs-widget');
		this._tabsWidget = this._instantiationService.createInstance(TerminalTabsWidget, this._terminalTabTree);
		this._terminalContainer = document.createElement('div');
		this._terminalContainer.classList.add('terminal-outer-container');
		this._terminalContainer.style.display = 'block';
		terminalService.onInstanceCreated(() => {
			this._tabsWidget?.rerender();
		});
		terminalService.onInstancesChanged(() => {
			terminalService.setContainers(parentElement, this._terminalContainer);
			this._tabsWidget?.rerender();
		});
		this._terminalService = terminalService;

		_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.showTabs')) {
				this._showTabs = terminalService.configHelper.config.showTabs;
				this._updateVisibility();
			} else if (e.affectsConfiguration('terminal.integrated.tabsLocation')) {
				this.TAB_TREE_INDEX = terminalService.configHelper.config.tabsLocation === 'left' ? 0 : 1;
				this.TERMINAL_CONTAINER_INDEX = terminalService.configHelper.config.tabsLocation === 'left' ? 1 : 0;
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

		this._tabsWidget = this._instantiationService.createInstance(TerminalTabsWidget, this._terminalTabTree);

		this._splitView.addView({
			element: this._terminalTabTree,
			layout: width => this._tabsWidget!.layout(this._height, width),
			minimumSize: 200,
			maximumSize: 300,
			onDidChange: () => Disposable.None,
		}, Sizing.Distribute, this.TAB_TREE_INDEX);

		this._splitView.addView({
			element: this._terminalContainer,
			layout: width => this._terminalService.terminalTabs.forEach(tab => tab.layout(width, this._height || 0)),
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

	layout(width: number, height: number): void {
		this._splitView.layout(width);
		this._height = height;
	}
}
