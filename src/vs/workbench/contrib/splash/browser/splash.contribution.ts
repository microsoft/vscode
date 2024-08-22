/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { ISplashStorageService } from './splash';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { PartsSplash } from './partsSplash';
import { IPartsSplash } from '../../../../platform/theme/common/themeService';

registerSingleton(ISplashStorageService, class SplashStorageService implements ISplashStorageService {
	_serviceBrand: undefined;

	async saveWindowSplash(splash: IPartsSplash): Promise<void> {
		const raw = JSON.stringify(splash);
		localStorage.setItem('monaco-parts-splash', raw);
	}
}, InstantiationType.Delayed);

registerWorkbenchContribution2(
	PartsSplash.ID,
	PartsSplash,
	WorkbenchPhase.BlockStartup
);
