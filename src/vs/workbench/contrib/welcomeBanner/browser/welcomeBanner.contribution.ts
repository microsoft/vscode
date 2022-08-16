/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { URI } from 'vs/base/common/uri';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

class WelcomeBannerContribution {

	private static readonly WELCOME_BANNER_DISMISSED_KEY = 'workbench.banner.welcome.dismissed';

	constructor(
		@IBannerService bannerService: IBannerService,
		@IStorageService storageService: IStorageService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService
	) {
		const welcomeBanner = environmentService.options?.welcomeBanner;
		if (!welcomeBanner) {
			return; // welcome banner is not enabled
		}

		if (storageService.getBoolean(WelcomeBannerContribution.WELCOME_BANNER_DISMISSED_KEY, StorageScope.PROFILE, false)) {
			return; // welcome banner dismissed
		}

		let icon: ThemeIcon | URI | undefined = undefined;
		if (typeof welcomeBanner.icon === 'string') {
			icon = ThemeIcon.fromId(welcomeBanner.icon);
		} else if (welcomeBanner.icon) {
			icon = URI.revive(welcomeBanner.icon);
		}

		bannerService.show({
			id: 'welcome.banner',
			message: welcomeBanner.message,
			icon,
			actions: welcomeBanner.actions,
			onClose: () => {
				storageService.store(WelcomeBannerContribution.WELCOME_BANNER_DISMISSED_KEY, true, StorageScope.PROFILE, StorageTarget.MACHINE);
			}
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WelcomeBannerContribution, 'WelcomeBannerContribution', LifecyclePhase.Restored);
