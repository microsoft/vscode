/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ISplashStorageService } from 'vs/workbench/contrib/splash/browser/splash';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { PartsSplash } from 'vs/workbench/contrib/splash/browser/partsSplash';
import { IPartsSplash } from 'vs/platform/theme/common/themeService';

class SplashStorageService implements ISplashStorageService {
	_serviceBrand: undefined;
	readonly saveWindowSplash: (splash: IPartsSplash) => Promise<void>;

	constructor(@INativeHostService nativeHostService: INativeHostService) {
		this.saveWindowSplash = nativeHostService.saveWindowSplash.bind(nativeHostService);
	}
}

registerSingleton(ISplashStorageService, SplashStorageService, true);

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(
	PartsSplash,
	'PartsSplash',
	LifecyclePhase.Starting
);
