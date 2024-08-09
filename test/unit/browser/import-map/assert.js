/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAmdModule, root } from './amdx.js'

const module = await importAmdModule(
	`${root}/test/unit/assert.js`,
)

const { AssertionError, deepEqual, deepStrictEqual, doesNotReject, doesNotThrow, equal, fail, ifError, notDeepEqual, notDeepStrictEqual, ok, rejects, strictEqual, throws, notStrictEqual, notEqual } = module

export { AssertionError, deepEqual, deepStrictEqual, doesNotReject, doesNotThrow, equal, fail, ifError, notDeepEqual, notDeepStrictEqual, ok, rejects, strictEqual, throws, notStrictEqual, notEqual }

export default module
