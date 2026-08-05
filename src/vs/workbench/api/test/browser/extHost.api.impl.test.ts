/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { URI } from '../../../../base/common/uri.js';
import { originalFSPath } from '../../../../base/common/resources.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getValidatedTerminalInternalOptions } from '../../common/extHost.api.impl.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';

suite('ExtHost API', function () {
	test('issue #51387: originalFSPath', function () {
		if (isWindows) {
			assert.strictEqual(originalFSPath(URI.file('C:\\test')).charAt(0), 'C');
			assert.strictEqual(originalFSPath(URI.file('c:\\test')).charAt(0), 'c');

			assert.strictEqual(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('C:\\test'))))).charAt(0), 'C');
			assert.strictEqual(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('c:\\test'))))).charAt(0), 'c');
		}
	});

	test('TerminalOptions.isRemoteResolverTerminal requires terminalRemoteResolver proposal', () => {
		const options: vscode.TerminalOptions = { isRemoteResolverTerminal: true };

		assert.throws(() => getValidatedTerminalInternalOptions(nullExtensionDescription, options), /CANNOT use API proposal: terminalRemoteResolver/);
		assert.deepStrictEqual(getValidatedTerminalInternalOptions({
			...nullExtensionDescription,
			enabledApiProposals: ['terminalRemoteResolver']
		}, options), { isRemoteResolverTerminal: true });
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
