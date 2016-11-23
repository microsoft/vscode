/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as modes from 'vs/editor/common/modes';

export class FrankensteinMode implements modes.IMode {

	private _modeId: string;

	constructor(descriptor: modes.IModeDescriptor) {
		this._modeId = descriptor.id;
	}

	public getId(): string {
		return this._modeId;
	}
}
