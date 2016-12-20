/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IMode } from 'vs/editor/common/modes';

let instanceCount = 0;
function generateMockModeId(): string {
	return 'mockMode' + (++instanceCount);
}

export class MockMode implements IMode {
	private _id: string;

	constructor(id?: string) {
		if (typeof id === 'undefined') {
			id = generateMockModeId();
		}
		this._id = id;
	}

	public getId(): string {
		return this._id;
	}
}
