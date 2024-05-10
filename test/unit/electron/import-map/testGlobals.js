/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// export const testGlobals = globalThis.testGlobals


const { testGlobalRequire } = globalThis;

const modules = [
	'assert',
	'path',
	'glob',
	'minimist',
	'util',
	'events',
	'os',
	'url',
	'sinon',
	'child_process',
	'string_decoder',
	'sinon-test',
	'fs',
	'net',
	'yauzl',
	'graceful-fs',
	'stream',
	'@vscode/ripgrep',
	'@parcel/watcher',
	'electron',
	'cookie',
	'jschardet',
	'vscode-regexpp',
	'crypto',
	'kerberos',
	'native-is-elevated',
	'@xterm/xterm',
	'native-watchdog',
	'zlib',
	'@xterm/headless',
	'@vscode/sqlite3',
	'inspector',
	'native-keymap',
	'@vscode/windows-registry'
]



const createTestGlobals = () => {
	const map = Object.create(null)
	for (const module of modules) {
		Object.defineProperty(map, module, {
			get [module]() {
				return testGlobalRequire(module)
			}
		})
	}
	return map
}

export const testGlobals = createTestGlobals()
