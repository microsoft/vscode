/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';

export class StealthShadowsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.stealthShadows';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILayoutService private readonly layoutService: ILayoutService
	) {
		super();

		this.updateStealthShadows();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('workbench.depth')) {
				this.updateStealthShadows();
			}
		}));
	}

	private updateStealthShadows(): void {
		const enabled = this.configurationService.getValue<boolean>('workbench.depth') ?? false;
		this.layoutService.mainContainer.classList.toggle('stealth-shadows-enabled', enabled);
	}
}
