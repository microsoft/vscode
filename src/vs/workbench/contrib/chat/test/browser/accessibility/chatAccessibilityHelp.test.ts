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

	test('describes the VS Code pet context menu', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;
		const helpText = getAccessibilityHelpText('agentView', keybindingService, true);

		assert.deepStrictEqual({
			keybinding: helpText.includes('<keybinding:editor.action.showContextMenu>'),
			navigation: helpText.includes('use the up and down arrow keys to choose'),
			actions: helpText.includes('Go on the Run') && helpText.includes('Grow') && helpText.includes('Shrink') && helpText.includes('Stable Colors') && helpText.includes('Insiders Colors'),
			petMovement: helpText.includes('Drag it around the chat with the mouse') && helpText.includes('left and right arrows to make it hop'),
			petHopping: helpText.includes('make it hop along the input until it reaches an edge'),
			petRevival: helpText.includes('automatically returns to the input'),
		}, {
			keybinding: true,
			navigation: true,
			actions: true,
			petMovement: true,
			petHopping: true,
			petRevival: true,
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

	test('only describes the floating input window when enabled in panel chat', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;
		const describesInputWindow = (enabled: boolean) =>
			getAccessibilityHelpText('panelChat', keybindingService, true, false, false, enabled).includes('floating chat input window');

		assert.deepStrictEqual({
			enabled: describesInputWindow(true),
			disabled: describesInputWindow(false),
		}, {
			enabled: true,
			disabled: false,
		});
	});

	test('only describes spoken agent progress in agent mode', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('brief progress updates'),
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes('brief progress updates'),
		}, {
			agentView: true,
			panelChat: false,
		});
	});
});
