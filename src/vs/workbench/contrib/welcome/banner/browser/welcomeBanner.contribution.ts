/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { Codicon, iconRegistry } from 'vs/base/common/codicons';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { FileAccess } from 'vs/base/common/network';

class WelcomeBannerContribution {

	private static readonly WELCOME_BANNER_DISMISSED_KEY = 'workbench.banner.welcome.dismissed';

	constructor(
		@IBannerService bannerService: IBannerService,
		@IStorageService storageService: IStorageService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService
	) {
		const welcomeBanner = environmentService.options?.welcomeBanner;
		if (!welcomeBanner) {
			return; // welcome banner is not enabled
		}

		if (storageService.getBoolean(WelcomeBannerContribution.WELCOME_BANNER_DISMISSED_KEY, StorageScope.GLOBAL, false)) {
			return; // welcome banner dismissed
		}

		let icon: Codicon | undefined = undefined;
		if (welcomeBanner.icon) {
			icon = iconRegistry.get(welcomeBanner.icon);
		}

		bannerService.show({
			id: 'welcome.banner',
			message: welcomeBanner.message,
			icon: icon ?? FileAccess.asBrowserUri('vs/workbench/browser/media/code-icon.svg', require),
			actions: welcomeBanner.actions,
			onClose: () => {
				storageService.store(WelcomeBannerContribution.WELCOME_BANNER_DISMISSED_KEY, true, StorageScope.GLOBAL, StorageTarget.MACHINE);
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeBannerContribution, LifecyclePhase.Restored);
