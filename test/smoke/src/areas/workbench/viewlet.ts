/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { API } from '../../spectron/client';

export abstract class Viewlet {

	constructor(protected api: API) {
		// noop
	}

	async getTitle(): Promise<string> {
		return this.api.waitForTextContent('.monaco-workbench-container .part.sidebar > .title > .title-label > span');
	}
}