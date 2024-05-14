/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

console.log('fake api', typeof globalThis.vscodeFakeApi)

const api = globalThis.vscodeFakeApi
if (!api) {
	throw new Error('vscode api not available')
}

const { window, commands } = api

export { window, commands }
