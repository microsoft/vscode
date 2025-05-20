/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createTerminalLanguageVirtualUri } from '../../browser/lspTerminalModelContentProvider.js';

// TODO: Conform test to Windows Path once we start supporting LSP REPL completion on Windows.
suite('LspTerminalModelContentProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	suite('createTerminalLanguageVirtualUri', () => {
		test('should create a valid URI with given terminalId and languageExtension such as py', () => {
			const terminalId = 1;
			const languageExtension = 'py';
			const resultUri = createTerminalLanguageVirtualUri(terminalId, languageExtension);
			const expectedUri = URI.from({
				scheme: Schemas.vscodeTerminal,
				path: '/terminal1.py'
			});
			assert.strictEqual(resultUri.scheme, expectedUri.scheme, 'Scheme should match');
			assert.strictEqual(resultUri.path, expectedUri.path, 'Path should match');
			assert.strictEqual(resultUri.toString(), expectedUri.toString(), 'URI string representation should match');
		});

		test('should create a valid URI with a different terminalId and languageExtension', () => {
			const terminalId = 42;
			const languageExtension = 'PS1';
			const resultUri = createTerminalLanguageVirtualUri(terminalId, languageExtension);
			const expectedUri = URI.from({
				scheme: Schemas.vscodeTerminal,
				path: '/terminal42.js'
			});
			assert.strictEqual(resultUri.scheme, expectedUri.scheme, 'Scheme should match');
			assert.strictEqual(resultUri.path, expectedUri.path, 'Path should match');
			assert.strictEqual(resultUri.toString(), expectedUri.toString(), 'URI string representation should match');
		});
	});
});
