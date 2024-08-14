/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { importAMDNodeModule } from 'vs/amdX';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { isESM } from 'vs/base/common/amd';

(isESM ? suite : suite.skip)('Modules Loading in ESM via importAMDNodeModule()', () => {

	test('@vscode/iconv-lite-umd', async () => {
		const module = await importAMDNodeModule<typeof import('@vscode/iconv-lite-umd')>('@vscode/iconv-lite-umd', 'lib/iconv-lite-umd.js');
		assert.ok(typeof module.getDecoder === 'function');
	});

	test.skip('@vscode/tree-sitter-wasm', async () => {
		//TODO@esm this cannot be resolved in ESM because the module is not self-contained
		const module = await importAMDNodeModule<typeof import('@vscode/tree-sitter-wasm')>('@vscode/tree-sitter-wasm', 'wasm/tree-sitter.js');
		assert.ok(typeof module.Parser === 'function');
	});

	test('jschardet', async () => {
		const jschardet = await importAMDNodeModule<typeof import('jschardet')>('jschardet', isESM ? 'dist/jschardet.js' : 'dist/jschardet.min.js');
		assert.ok(typeof jschardet.detect === 'function');
	});

	test('tas-client-umd', async () => {
		const tas = await importAMDNodeModule<typeof import('tas-client-umd')>('tas-client-umd', 'lib/tas-client-umd.js');
		assert.ok(typeof tas.ExperimentationService === 'function');
	});

	test('vscode-oniguruma', async () => {
		const oniguruma = await importAMDNodeModule<typeof import('vscode-oniguruma')>('vscode-oniguruma', 'release/main.js');
		assert.ok(typeof oniguruma.loadWASM === 'function');
	});

	test('vscode-textmate', async () => {
		const textmate = await importAMDNodeModule<typeof import('vscode-textmate')>('vscode-textmate', 'release/main.js');
		assert.ok(typeof textmate.parseRawGrammar === 'function');
	});

	test('@xterm', async () => {
		const xterm = await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js');
		assert.ok(typeof xterm.Terminal === 'function');

		const addon1 = await importAMDNodeModule<typeof import('@xterm/addon-clipboard')>('@xterm/addon-clipboard', 'lib/addon-clipboard.js');
		assert.ok(typeof addon1.ClipboardAddon === 'function');

		const addon2 = await importAMDNodeModule<typeof import('@xterm/addon-image')>('@xterm/addon-image', 'lib/addon-image.js');
		assert.ok(typeof addon2.ImageAddon === 'function');

		const addon3 = await importAMDNodeModule<typeof import('@xterm/addon-search')>('@xterm/addon-search', 'lib/addon-search.js');
		assert.ok(typeof addon3.SearchAddon === 'function');

		const addon4 = await importAMDNodeModule<typeof import('@xterm/addon-unicode11')>('@xterm/addon-unicode11', 'lib/addon-unicode11.js');
		assert.ok(typeof addon4.Unicode11Addon === 'function');

		const addon5 = await importAMDNodeModule<typeof import('@xterm/addon-webgl')>('@xterm/addon-webgl', 'lib/addon-webgl.js');
		assert.ok(typeof addon5.WebglAddon === 'function');

		const addon6 = await importAMDNodeModule<typeof import('@xterm/addon-serialize')>('@xterm/addon-serialize', 'lib/addon-serialize.js');
		assert.ok(typeof addon6.SerializeAddon === 'function');
	});

	test.skip('@vscode/vscode-languagedetection', async () => { // TODO this test prints to console which is disallowed
		const languagedetection = await importAMDNodeModule<typeof import('@vscode/vscode-languagedetection')>('@vscode/vscode-languagedetection', 'dist/lib/index.js');
		assert.ok(typeof languagedetection.ModelOperations === 'function');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
