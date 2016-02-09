/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import git = require('vs/workbench/parts/git/common/git');
import winjs = require('vs/base/common/winjs.base');

export class GitOperation implements git.IGitOperation {

	constructor(public id: string, private fn: () => winjs.Promise) {
		// noop
	}

	public run(): winjs.Promise {
		return this.fn();
	}

	public dispose(): void {
		// noop
	}
}

export class CommandOperation implements git.IGitOperation {

	public id: string = git.ServiceOperations.COMMAND;

	constructor(public input:string) {
		// noop
	}

	public run(): winjs.Promise {
		return winjs.TPromise.as(null);
	}

	public dispose(): void {
		this.id = null;
		this.input = null;
	}
}
