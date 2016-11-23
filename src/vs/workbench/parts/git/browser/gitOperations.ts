/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IGitOperation, IRawStatus } from 'vs/workbench/parts/git/common/git';
import { TPromise } from 'vs/base/common/winjs.base';

export class GitOperation implements IGitOperation {

	id: string;

	constructor(id: string, private fn: () => TPromise<IRawStatus>) {
		this.id = id;
	}

	run(): TPromise<IRawStatus> {
		return this.fn();
	}

	dispose(): void {
		// noop
	}
}