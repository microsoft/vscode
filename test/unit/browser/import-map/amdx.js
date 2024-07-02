/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const root = new URL('../../../../', import.meta.url).toString().slice(0, -1)

const getResult = defineCall => {
	if (typeof defineCall.callback === 'function') {
		return defineCall.callback([])
	}
	return defineCall.callback
}

export const importAmdModule = async (absolutePath) => {
	const defineCalls = []
	globalThis.define = (id, dependencies, callback) => {
		if (typeof id !== 'string') {
			callback = dependencies
			dependencies = id
			id = null
		}
		if (typeof dependencies !== 'object' || !Array.isArray(dependencies)) {
			callback = dependencies
			dependencies = null
		}
		defineCalls.push({
			id, dependencies, callback
		})
	}

	globalThis.define.amd = true;
	globalThis.exports = Object.create(null)
	await import(absolutePath)
	if (Object.keys(globalThis.exports).length > 0) {
		return globalThis.exports
	}
	if (defineCalls.length === 0) {
		throw new Error('no module was defined')
	}
	const defineCall = defineCalls.pop()
	if (Array.isArray(defineCall.dependencies) && defineCall.dependencies.length > 0) {
		throw new Error(`dependencies are not supported`)
	}
	const result = getResult(defineCall)
	return result
}
