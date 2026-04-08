/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// test-workbench_change - new file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IURLHandler } from '../../../../platform/url/common/url.js';

export class TsCodeCallbackHandler extends Disposable implements IURLHandler {

	constructor() {
		super();
	}

	// test-workbench_change start
	// Token is now obtained via polling after login, no callback handling needed
	async handleURL(_uri: URI): Promise<boolean> {
		return false;
	}
	// test-workbench_change end
}
