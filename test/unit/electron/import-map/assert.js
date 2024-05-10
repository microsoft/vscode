/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testGlobals } from './testGlobals.js';

const { strictEqual, deepEqual, deepStrictEqual, ok, notStrictEqual, fail, notEqual, throws, notDeepStrictEqual, equal } = testGlobals['assert'];

export { strictEqual, deepEqual, deepStrictEqual, ok, notStrictEqual, fail, notEqual, throws, notDeepStrictEqual, equal };

export default testGlobals.assert;
