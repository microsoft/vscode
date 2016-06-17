/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {TerminalPanel} from 'vs/workbench/parts/terminal/electron-browser/terminalPanel';

export class TerminalService implements ITerminalService {
	public serviceId = ITerminalService;

	constructor(
		@IPanelService private panelService: IPanelService,
		@IPartService private partService: IPartService
	) {
	}

	public focus(): TPromise<any> {
		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public focusNext(): TPromise<any> {
		return this.focus().then(() => {
			return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
				terminalPanel.focusNext();
			});
		});
	}

	public focusPrevious(): TPromise<any> {
		return this.focus().then(() => {
			return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
				terminalPanel.focusPrevious();
			});
		});
	}

	public toggle(): TPromise<any> {
		const panel = this.panelService.getActivePanel();
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			this.partService.setPanelHidden(true);

			return TPromise.as(null);
		}

		return this.panelService.openPanel(TERMINAL_PANEL_ID, true);
	}

	public createNew(): TPromise<any> {
		return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
			terminalPanel.createNewTerminalInstance();
		});
	}

	public close(): TPromise<any> {
		return this.toggleAndGetTerminalPanel().then((terminalPanel) => {
			terminalPanel.closeActiveTerminal();
		});
	}

	private toggleAndGetTerminalPanel(): TPromise<TerminalPanel> {
		return new TPromise<TerminalPanel>((complete) => {
			let panel = this.panelService.getActivePanel();
			if (!panel || panel.getId() !== TERMINAL_PANEL_ID) {
				this.toggle().then(() => {
					panel = this.panelService.getActivePanel();
					complete(<TerminalPanel>panel);
				});
			}
			complete(<TerminalPanel>panel);
		});
	}

	/*public getTerminalInstanceTitles(): TPromise<string[]> {
		return this.getTerminalPanel().then((terminalPanel) => {
			return terminalPanel.getTerminalInstanceTitles();
		});
	}*/
}