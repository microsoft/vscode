/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Code } from '../../vscode/code';

export abstract class Viewlet {

	constructor(protected code: Code) {
		// noop
	}

	async getTitle(): Promise<string> {
		return this.code.waitForTextContent('.monaco-workbench-container .part.sidebar > .title > .title-label > span');
	}
}