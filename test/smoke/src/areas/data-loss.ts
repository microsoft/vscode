/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class DataLoss {

	constructor(private spectron: SpectronApplication) {
	}

	public openExplorerViewlet(): Promise<any> {
		return this.spectron.command('workbench.view.explorer');
	}

	public async verifyTabIsDirty(tabName: string, active?: boolean): Promise<any> {
		let activeSelector = active ? '.active' : '';
		let el = await this.spectron.client.element(`.tabs-container .tab.dirty${activeSelector}[aria-label="${tabName}, tab"]`);
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}
}