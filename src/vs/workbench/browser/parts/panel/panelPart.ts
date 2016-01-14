/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import timer = require('vs/base/common/timer');
import uuid = require('vs/base/common/uuid');
import strings = require('vs/base/common/strings');
import {Registry} from 'vs/platform/platform';
import {IPanel} from 'vs/workbench/common/panel';
import {EventType as WorkbenchEventType, CompositeEvent} from 'vs/workbench/common/events';
import {CompositePart} from 'vs/workbench/browser/parts/compositePart';
import {Panel, PanelRegistry, Extensions as PanelExtensions} from 'vs/workbench/browser/panel';
import {IPanelService} from 'vs/workbench/services/panel/common/panelService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IEventService} from 'vs/platform/event/common/event';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	public static activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	public serviceId = IPanelService;

	private blockOpeningPanel: boolean;
	private currentPanelOpenToken: string;

	constructor(
		messageService: IMessageService,
		storageService: IStorageService,
		eventService: IEventService,
		telemetryService: ITelemetryService,
		contextMenuService: IContextMenuService,
		partService: IPartService,
		keybindingService: IKeybindingService,
		id: string
	) {
		super(messageService, storageService, eventService, telemetryService, contextMenuService, partService, keybindingService,
			(<PanelRegistry>Registry.as(PanelExtensions.Panels)), PanelPart.activePanelSettingsKey, id);
	}

	public openPanel(id: string, focus?: boolean): TPromise<Panel> {
		if (this.blockOpeningPanel) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if panel part is hidden and show if so
		if (this.partService.isPanelPartHidden()) {
			try {
				this.blockOpeningPanel = true;
				this.partService.setPanelPartHidden(false);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		// Check if panel already visible and just focus in that case
		if (this.activePanel && this.activePanel.getId() === id) {
			if (focus) {
				this.activePanel.focus();
			}

			// Fullfill promise with panel that is being opened
			return TPromise.as(this.activePanel);
		}

		// Open
		return this.doOpenPanel(id, focus);
	}

	private doOpenPanel(id: string, focus?: boolean): TPromise<Panel> {
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Open Panel {0}', id.substr(id.lastIndexOf('.') + 1)));

		// Use a generated token to avoid race conditions from long running promises
		let currentPanelOpenToken = uuid.generateUuid();
		this.currentPanelOpenToken = currentPanelOpenToken;

		// Emit Panel Opening Event
		this.emit(WorkbenchEventType.PANEL_OPENING, new CompositeEvent(id));

		// Hide current
		let hidePromise: TPromise<void>;
		if (this.activePanel) {
			hidePromise = this.hideActivePanel();
		} else {
			hidePromise = TPromise.as(null);
		}

		return hidePromise.then(() => {

			// Update Title
			this.updateTitle(id);

			// Create panel
			return this.createPanel(id, true).then((panel: Panel) => {

				// Check if another panel opened meanwhile and return in that case
				if ((this.currentPanelOpenToken !== currentPanelOpenToken) || (this.activePanel && this.activePanel.getId() !== panel.getId())) {
					timerEvent.stop();

					return TPromise.as(null);
				}

				// Check if panel already visible and just focus in that case
				if (this.activePanel && this.activePanel.getId() === panel.getId()) {
					if (focus) {
						panel.focus();
					}

					timerEvent.stop();

					// Fullfill promise with panel that is being opened
					return TPromise.as(panel);
				}

				// Show Panel and Focus
				return this.showPanel(panel).then(() => {
					if (focus) {
						panel.focus();
					}

					timerEvent.stop();

					// Fullfill promise with panel that is being opened
					return panel;
				});
			});
		});
	}

	private get activePanel(): IPanel {
		return this.getActivePanel();
	}

	private createPanel(id: string, isActive?: boolean): TPromise<Panel> {
		return this.createComposite(id, isActive);
	}

	private showPanel(panel: Panel): TPromise<void> {
		return this.showComposite(panel);
	}

	public getActivePanel(): IPanel {
		return this.getActiveComposite();
	}

	public getLastActivePanelId(): string {
		return this.getLastActiveCompositetId();
	}

	public hideActivePanel(): TPromise<void> {
		return this.hideActiveComposite();
	}
}
