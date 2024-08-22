/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { ISplashStorageService } from '../browser/splash';
import { INativeHostService } from '../../../../platform/native/common/native';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { PartsSplash } from '../browser/partsSplash';
import { IPartsSplash } from '../../../../platform/theme/common/themeService';

class SplashStorageService implements ISplashStorageService {
	_serviceBrand: undefined;
	readonly saveWindowSplash: (splash: IPartsSplash) => Promise<void>;

	constructor(@INativeHostService nativeHostService: INativeHostService) {
		this.saveWindowSplash = nativeHostService.saveWindowSplash.bind(nativeHostService);
	}
}

registerSingleton(ISplashStorageService, SplashStorageService, InstantiationType.Delayed);

registerWorkbenchContribution2(
	PartsSplash.ID,
	PartsSplash,
	WorkbenchPhase.BlockStartup
);
