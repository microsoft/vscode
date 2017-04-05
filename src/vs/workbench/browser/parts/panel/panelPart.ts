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
import { ClosePanelAction, PanelAction, ToggleMaximizedPanelAction } from 'vs/workbench/browser/parts/panel/panelActions';
import { IThemeService, registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND, PANEL_BORDER_TOP_COLOR, PANEL_ACTIVE_TITLE_COLOR, PANEL_INACTIVE_TITLE_COLOR, PANEL_ACTIVE_TITLE_BORDER } from 'vs/workbench/common/theme';
import { highContrastOutline, focus } from "vs/platform/theme/common/colorRegistry";

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
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(
			messageService,
			storageService,
			telemetryService,
			contextMenuService,
			partService,
			keybindingService,
			instantiationService,
			themeService,
			Registry.as<PanelRegistry>(PanelExtensions.Panels),
			PanelPart.activePanelSettingsKey,
			'panel',
			'panel',
			Scope.PANEL,
			null,
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

	protected updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();
		container.style('background-color', this.getColor(PANEL_BACKGROUND));

		const title = this.getTitleArea();
		title.style('border-top-color', this.getColor(PANEL_BORDER_TOP_COLOR));
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
		return [
			this.instantiationService.createInstance(ToggleMaximizedPanelAction, ToggleMaximizedPanelAction.ID, ToggleMaximizedPanelAction.LABEL),
			this.instantiationService.createInstance(ClosePanelAction, ClosePanelAction.ID, ClosePanelAction.LABEL)
		];
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
			},
			updateStyles: () => {
				// Handled via theming participant
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

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {

	// Title Active
	const titleActive = theme.getColor(PANEL_ACTIVE_TITLE_COLOR);
	const titleActiveBorder = theme.getColor(PANEL_ACTIVE_TITLE_BORDER);
	collector.addRule(`
		.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item:hover .action-label,
		.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label.checked {
			color: ${titleActive};
			border-bottom-color: ${titleActiveBorder};
		}
	`);

	// Title Inactive
	const titleInactive = theme.getColor(PANEL_INACTIVE_TITLE_COLOR);
	collector.addRule(`
		.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label {
			color: ${titleInactive};
		}
	`);

	// Title focus
	const focusBorder = theme.getColor(focus);
	collector.addRule(`
		.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label:focus {
			color: ${titleActive};
			border-bottom-color: ${focusBorder} !important;
			border-bottom: 1px solid;
			outline: none;
		}
	`);

	// High Contrast Styling
	if (theme.type === 'hc') {
		const outline = theme.getColor(highContrastOutline);

		collector.addRule(`
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label.checked,
			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label:hover {
				outline-color: ${outline};
				outline-width: 1px;
				outline-style: solid;
				border-bottom: none;
				padding-bottom: 0;
				outline-offset: 3px;
			}

			.monaco-workbench > .part.panel > .title > .panel-switcher-container > .monaco-action-bar .action-item .action-label:hover:not(.checked) {
				outline-style: dashed;
			}
		`);
	}
});