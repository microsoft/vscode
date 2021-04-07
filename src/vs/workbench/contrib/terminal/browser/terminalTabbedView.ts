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
	private TABS_WIDGET_INDEX: number;
	private TERMINALS_INDEX: number;

	constructor(
		parentElement: HTMLElement,
		@ITerminalService _terminalService: ITerminalService,
		@IConfigurationService _configurationService: IConfigurationService
	) {
		super();
		this._showTabs = _terminalService.configHelper.config.showTabs;
		this._createSplitView(parentElement);

		this.TABS_WIDGET_INDEX = 0;
		this.TERMINALS_INDEX = 0;

		_configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated.showTabs')) {
				this._showTabs = _terminalService.configHelper.config.showTabs;
				this._updateVisibility();
			}
		});
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
			minimumSize: 600,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None,
			setVisible: () => this._showTabs
		}, Sizing.Distribute);


		this._splitView.addView({
			element: this._terminalContainer,
			layout: size => undefined,
			minimumSize: 220,
			maximumSize: Number.POSITIVE_INFINITY,
			onDidChange: () => Disposable.None
		}, Sizing.Distribute);
	}

	private _updateVisibility() {
		if (!this._splitView) {
			return;
		}
		this._splitView.setViewVisible(this.TABS_WIDGET_INDEX, this._showTabs);
		this._splitView.setViewVisible(this.TERMINALS_INDEX, true);
	}

	private _configureViews(): void {
		this._terminalContainer!.innerText = 'Hi';
		this._terminalTabTree!.innerText = 'Hello';
	}

	layout(width: number): void {
		this._splitView.layout(width);
	}
}
