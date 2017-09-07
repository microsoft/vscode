/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';

export abstract class Viewlet {

	constructor(protected spectron: SpectronApplication) {
		// noop
	}

	public async getTitle(): Promise<string> {
		return this.spectron.client.waitForText('.monaco-workbench-container .part.sidebar > .title > .title-label > span');
	}

}