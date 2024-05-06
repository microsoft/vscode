/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAmdModule, root } from './amdx.js'

const module = await importAmdModule(
	`${root}/node_modules/sinon/pkg/sinon.js`,
)

const { createSandbox, assert, clock, requests, server, match, spy, stub, mock, fake, useFakeTimers, useFakeXMLHttpRequest, useFakeServer, restore, reset, resetHistory, resetBehaviour, usingPromise, verify, verifyAndRestore, replace, replaceGetter, replaceSetter, createStubInstance } = module

export { createSandbox, assert, clock, requests, server, match, spy, stub, mock, fake, useFakeTimers, useFakeXMLHttpRequest, useFakeServer, restore, reset, resetHistory, resetBehaviour, usingPromise, verify, verifyAndRestore, replace, replaceGetter, replaceSetter, createStubInstance }

export default module
