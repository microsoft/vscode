/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';
import { IBannerService } from '../../../services/banner/browser/bannerService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

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
	.registerWorkbenchContribution(WelcomeBannerContribution, LifecyclePhase.Restored);
