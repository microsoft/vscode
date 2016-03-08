/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';

export class MockMode implements modes.IMode {

	private _id:string;

	constructor(id:string = 'mockMode') {
		this._id = id;
	}

	public getId():string {
		return this._id;
	}

	public toSimplifiedMode(): modes.IMode {
		return this;
	}
}
