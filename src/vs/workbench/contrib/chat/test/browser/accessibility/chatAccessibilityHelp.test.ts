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

	test('only describes the selection side chat affordance in the sessions window', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			sessionsWindow: getAccessibilityHelpText('agentView', keybindingService, true, true).includes('Ask Question'),
			regularWindow: getAccessibilityHelpText('agentView', keybindingService, true, false).includes('Ask Question'),
		}, {
			sessionsWindow: true,
			regularWindow: false,
		});
	});

	test('only describes the sticky prompt header when it is shown', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;
		const describesStickyHeader = (shown: boolean) =>
			getAccessibilityHelpText('agentView', keybindingService, true, false, shown).includes('pinned to the top of the transcript');

		assert.deepStrictEqual({
			shown: describesStickyHeader(true),
			notShown: describesStickyHeader(false),
			byDefault: getAccessibilityHelpText('agentView', keybindingService, true).includes('pinned to the top of the transcript'),
		}, {
			shown: true,
			notShown: false,
			byDefault: false,
		});
	});
});
