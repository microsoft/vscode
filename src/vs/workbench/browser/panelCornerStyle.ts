/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, LayoutSettings, PanelCornerStyle } from '../services/layout/browser/layoutService.js';

const PANEL_BORDER_RADIUS = '--workbench-panel-border-radius';

export class PanelCornerStyleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.panelCornerStyle';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(LayoutSettings.PANEL_CORNER_STYLE) || e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
				this.update();
			}
		}));
		this._register(layoutService.onDidAddContainer(({ container }) => this.applyTo(container)));
		this.update();
	}

	private update(): void {
		for (const container of this.layoutService.containers) {
			this.applyTo(container);
		}
	}

	private applyTo(container: HTMLElement): void {
		container.style.removeProperty(PANEL_BORDER_RADIUS);
		if (this.environmentService.isSessionsWindow || this.configurationService.getValue<boolean>(LayoutSettings.MODERN_UI) === true) {
			switch (this.configurationService.getValue<PanelCornerStyle>(LayoutSettings.PANEL_CORNER_STYLE)) {
				case PanelCornerStyle.Square:
					container.style.setProperty(PANEL_BORDER_RADIUS, '0px');
					break;
				case PanelCornerStyle.Subtle:
					container.style.setProperty(PANEL_BORDER_RADIUS, 'var(--vscode-cornerRadius-small)');
					break;
				case PanelCornerStyle.Rounded:
					container.style.setProperty(PANEL_BORDER_RADIUS, 'var(--vscode-cornerRadius-xLarge)');
					break;
			}
		}
	}

	override dispose(): void {
		for (const container of this.layoutService.containers) {
			container.style.removeProperty(PANEL_BORDER_RADIUS);
		}
		super.dispose();
	}
}

registerWorkbenchContribution2(PanelCornerStyleContribution.ID, PanelCornerStyleContribution, WorkbenchPhase.BlockRestore);
