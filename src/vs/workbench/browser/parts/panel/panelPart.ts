/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/panelpart';
import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import Event from 'vs/base/common/event';
import { Builder, $ } from 'vs/base/browser/builder';
import { Registry } from 'vs/platform/platform';
import { Scope } from 'vs/workbench/browser/actionBarRegistry';
import { IPanel } from 'vs/workbench/common/panel';
import { CompositePart, ICompositeTitleLabel } from 'vs/workbench/browser/parts/compositePart';
import { Panel, PanelRegistry, Extensions as PanelExtensions } from 'vs/workbench/browser/panel';
import { IPanelService, IPanelIdentifier } from 'vs/workbench/services/panel/common/panelService';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ActionsOrientation, ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { ClosePanelAction, PanelAction } from 'vs/workbench/browser/parts/panel/panelActions';

export class PanelPart extends CompositePart<Panel> implements IPanelService {

	public static activePanelSettingsKey = 'workbench.panelpart.activepanelid';

	public _serviceBrand: any;

	private blockOpeningPanel: boolean;
	private panelSwitcherBar: ActionBar;

	private panelIdToActions: { [panelId: string]: PanelAction; };

	constructor(
		id: string,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IPartService partService: IPartService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(
			messageService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			Registry.as<PanelRegistry>(PanelExtensions.Panels),
			PanelPart.activePanelSettingsKey,
			'panel',
			'panel',
			Scope.PANEL,
			id,
			{ hasTitle: true }
		);

		this.panelIdToActions = Object.create(null);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Activate panel action on opening of a panel
		this.toUnbind.push(this.onDidPanelOpen(panel => this.updatePanelActions(panel.getId(), true)));

		// Deactivate panel action on close
		this.toUnbind.push(this.onDidPanelClose(panel => this.updatePanelActions(panel.getId(), false)));
	}

	private updatePanelActions(id: string, didOpen: boolean): void {
		if (this.panelIdToActions[id]) {
			didOpen ? this.panelIdToActions[id].activate() : this.panelIdToActions[id].deactivate();
		}
	}

	public get onDidPanelOpen(): Event<IPanel> {
		return this._onDidCompositeOpen.event;
	}

	public get onDidPanelClose(): Event<IPanel> {
		return this._onDidCompositeClose.event;
	}

	public openPanel(id: string, focus?: boolean): TPromise<Panel> {
		if (this.blockOpeningPanel) {
			return TPromise.as(null); // Workaround against a potential race condition
		}

		// First check if panel is hidden and show if so
		let promise = TPromise.as(null);
		if (!this.partService.isVisible(Parts.PANEL_PART)) {
			try {
				this.blockOpeningPanel = true;
				promise = this.partService.setPanelHidden(false);
			} finally {
				this.blockOpeningPanel = false;
			}
		}

		return promise.then(() => this.openComposite(id, focus));
	}

	public getPanels(): IPanelIdentifier[] {
		return Registry.as<PanelRegistry>(PanelExtensions.Panels).getPanels()
			.sort((v1, v2) => v1.order - v2.order);
	}

	protected getActions(): IAction[] {
		return [this.instantiationService.createInstance(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL)];
	}

	public getActivePanel(): IPanel {
		return this.getActiveComposite();
	}

	public getLastActivePanelId(): string {
		return this.getLastActiveCompositetId();
	}

	public hideActivePanel(): TPromise<void> {
		return this.hideActiveComposite().then(composite => void 0);
	}

	protected createTitleLabel(parent: Builder): ICompositeTitleLabel {
		let titleArea = $(parent).div({
			'class': ['panel-switcher-container']
		});

		// Show a panel switcher
		this.panelSwitcherBar = new ActionBar(titleArea, {
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('panelSwitcherBarAriaLabel', "Active Panel Switcher"),
			animated: false
		});
		this.toUnbind.push(this.panelSwitcherBar);

		this.fillPanelSwitcher();

		return {
			updateTitle: (id, title, keybinding) => {
				const action = this.panelIdToActions[id];
				if (action) {
					action.label = title;
				}
			}
		};
	}

	private fillPanelSwitcher(): void {
		const panels = this.getPanels();

		this.panelSwitcherBar.push(panels.map(panel => {
			const action = this.instantiationService.createInstance(PanelAction, panel);

			this.panelIdToActions[panel.id] = action;
			this.toUnbind.push(action);

			return action;
		}));
	}
}