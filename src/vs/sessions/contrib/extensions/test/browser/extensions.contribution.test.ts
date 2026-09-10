/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import '../../browser/extensions.contribution.js';

suite('Sessions - Extensions Contribution', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('registers the extension installation command', () => {
		assert.ok(CommandsRegistry.getCommand('workbench.extensions.installExtension'));
	});
});
