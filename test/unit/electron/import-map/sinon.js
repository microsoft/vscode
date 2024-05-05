/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { testGlobals } from './testGlobals.js';

const { stub, createSandbox, sandbox, useFakeTimers, spy, restore, createStubInstance, expectation, clock, defaultConfig, addBehaviour, setFormatter, assert, mock } = testGlobals.sinon;

export { addBehaviour, assert, clock, createSandbox, createStubInstance, defaultConfig, expectation, mock, restore, sandbox, setFormatter, spy, stub, useFakeTimers };

export default testGlobals.sinon;
