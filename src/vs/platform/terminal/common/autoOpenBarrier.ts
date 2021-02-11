/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Barrier } from 'vs/base/common/async';

export class AutoOpenBarrier extends Barrier {

	private readonly _timeout: any;

	constructor(autoOpenTimeMs: number) {
		super();
		this._timeout = setTimeout(() => this.open(), autoOpenTimeMs);
	}

	open(): void {
		clearTimeout(this._timeout);
		super.open();
	}
}
