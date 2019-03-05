/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalService, TERMINAL_PANEL_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService as CommonTerminalService } from 'vs/workbench/contrib/terminal/common/terminalService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TerminalPanel } from 'vs/workbench/contrib/terminal/browser/terminalPanel';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';

export abstract class TerminalService extends CommonTerminalService implements ITerminalService {

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IPanelService panelService: IPanelService,
		@IPartService partService: IPartService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@IDialogService dialogService: IDialogService
	) {
		super(contextKeyService, panelService, partService, lifecycleService, storageService, notificationService, dialogService);
	}

	public focusFindWidget(): Promise<void> {
		return this.showPanel(false).then(() => {
			const panel = this._panelService.getActivePanel() as TerminalPanel;
			panel.focusFindWidget();
			this._findWidgetVisible.set(true);
		});
	}

	public hideFindWidget(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.hideFindWidget();
			this._findWidgetVisible.reset();
			panel.focus();
		}
	}

	public findNext(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.showFindWidget();
			panel.getFindWidget().find(false);
		}
	}

	public findPrevious(): void {
		const panel = this._panelService.getActivePanel() as TerminalPanel;
		if (panel && panel.getId() === TERMINAL_PANEL_ID) {
			panel.showFindWidget();
			panel.getFindWidget().find(true);
		}
	}
}