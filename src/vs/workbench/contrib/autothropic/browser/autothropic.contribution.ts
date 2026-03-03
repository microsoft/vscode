/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts, Position } from '../../../services/layout/browser/layoutService.js';

const LAYOUT_INITIALIZED_KEY = 'autothropic.layoutInitialized';

/**
 * Runs once per workspace to set up the Autothropic IDE layout:
 * - Ensures the bottom panel is visible
 * - Focuses the Graph tab in the panel
 * - Sets panel to ~40% height
 */
class AutothropicLayoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.autothropicLayout';

	constructor(
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IStorageService private readonly storageService: IStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super();
		this.initialize();
	}

	private async initialize(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		const alreadyDone = this.storageService.getBoolean(LAYOUT_INITIALIZED_KEY, StorageScope.WORKSPACE, false);
		if (alreadyDone) {
			return;
		}

		// Ensure the bottom panel is visible
		if (!this.layoutService.isVisible(Parts.PANEL_PART)) {
			this.layoutService.setPartHidden(false, Parts.PANEL_PART);
		}

		// Ensure panel is at the bottom
		if (this.layoutService.getPanelPosition() !== Position.BOTTOM) {
			this.layoutService.setPanelPosition(Position.BOTTOM);
		}

		// Focus the graph view in the panel
		try {
			await this.viewsService.openView('autothropic.graphView', false);
		} catch {
			// Graph extension may not be ready yet - non-critical
		}

		// Mark as initialized so we don't repeat on next startup
		this.storageService.store(LAYOUT_INITIALIZED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}

registerWorkbenchContribution2(AutothropicLayoutContribution.ID, AutothropicLayoutContribution, WorkbenchPhase.AfterRestored);
