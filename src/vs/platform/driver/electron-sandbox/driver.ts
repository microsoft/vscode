/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserWindowDriver } from 'vs/platform/driver/browser/driver';

interface INativeWindowDriverHelper {
	exitApplication(): Promise<void>;
}

class NativeWindowDriver extends BrowserWindowDriver {

	constructor(private readonly helper: INativeWindowDriverHelper) {
		super();
	}

	override exitApplication(): Promise<void> {
		return this.helper.exitApplication();
	}
}

export function registerWindowDriver(helper: INativeWindowDriverHelper): void {
	Object.assign(window, { driver: new NativeWindowDriver(helper) });
}
