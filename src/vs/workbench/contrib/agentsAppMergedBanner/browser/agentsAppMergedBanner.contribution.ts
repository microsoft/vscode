/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';

/**
 * Tracks whether we have already shown the one-time banner explaining that
 * the formerly separate Agents application is now a window inside VS Code.
 * Stored in `StorageScope.APPLICATION` so the banner is shown at most once
 * per installation, regardless of profile.
 */
const AGENTS_APP_MERGED_BANNER_SHOWN_KEY = 'workbench.banner.agentsAppMerged.shown';

class AgentsAppMergedBannerContribution {

	constructor(
		@IBannerService bannerService: IBannerService,
		@IStorageService storageService: IStorageService,
		@IProductService productService: IProductService
	) {
		if (productService.quality === 'stable') {
			return;
		}

		if (storageService.getBoolean(AGENTS_APP_MERGED_BANNER_SHOWN_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		storageService.store(AGENTS_APP_MERGED_BANNER_SHOWN_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const message = localize('agentsAppMerged.message', "The Agents app is deprecated. Starting with this version, it is integrated into {0}.", productService.nameLong);
		const openAction = {
			href: 'command:workbench.action.openAgentsWindow',
			label: localize('agentsAppMerged.open', "Open Agents Window")
		};

		bannerService.show({
			id: 'workbench.banner.agentsAppMerged',
			icon: ThemeIcon.fromId('info'),
			message,
			ariaLabel: message,
			actions: [openAction]
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(AgentsAppMergedBannerContribution, LifecyclePhase.Restored);
