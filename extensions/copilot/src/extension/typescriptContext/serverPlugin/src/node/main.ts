/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// These must all be type imports to ensure that we can use the TS module
// pass into the init function.
import type tt from 'typescript/lib/tsserverlibrary';
import type * as c from './create';

// This import is OK since we don't use TS inside of it.
import TS from '../common/typescript';

let initCalled: boolean = false;
let create: typeof c.create | undefined = undefined;
function init(module: { typescript: typeof tt }) {
	if (!initCalled) {
		try {
			TS.install(module.typescript);
			create = (require('./create') as typeof c).create;
		} finally {
			initCalled = true;
		}
	}

	if (create === undefined) {
		throw new Error(`Couldn't initialize TypeScript Context Server Plugin.`);
	}

	return { create };
}
export = init;