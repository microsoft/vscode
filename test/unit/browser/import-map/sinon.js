/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAmdModule, root } from './amdx.js'

const module = await importAmdModule(
	`${root}/node_modules/sinon/pkg/sinon.js`,
)

const { addBehaviour, createSandbox, assert, clock, requests, server, match, spy, defaultConfig, expectation, stub, mock, fake, useFakeTimers, useFakeXMLHttpRequest, useFakeServer, restore, reset, resetHistory, sandbox, resetBehaviour, setFormatter, usingPromise, verify, verifyAndRestore, replace, replaceGetter, replaceSetter, createStubInstance } = module

export { addBehaviour, assert, clock, createSandbox, createStubInstance, defaultConfig, expectation, fake, match, mock, replace, replaceGetter, replaceSetter, requests, reset, resetBehaviour, resetHistory, restore, sandbox, server, setFormatter, spy, stub, useFakeServer, useFakeTimers, useFakeXMLHttpRequest, usingPromise, verify, verifyAndRestore }

export default module
