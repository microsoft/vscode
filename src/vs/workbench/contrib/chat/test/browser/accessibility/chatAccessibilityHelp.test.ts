/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { getAccessibilityHelpText } from '../../../browser/actions/chatAccessibilityHelp.js';

suite('Chat Accessibility Help', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only describes inline attachment references when supported', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			supported: getAccessibilityHelpText('agentView', keybindingService, true).includes('type # or @'),
			unsupported: getAccessibilityHelpText('agentView', keybindingService, false).includes('type # or @'),
		}, {
			supported: true,
			unsupported: false,
		});
	});
});
