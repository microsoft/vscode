/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../spectron/application';

export class FirstExperience {
	constructor(private spectron: SpectronApplication) {
		// noop
	}

	public async getWelcomeTab(): Promise<any> {
		let el = await this.spectron.client.element('.vs_code_welcome_page-name-file-icon');
		if (el.status === 0) {
			return el;
		}

		return undefined;
	}
}