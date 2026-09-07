/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { getAccessibilityHelpText } from '../../../browser/actions/chatAccessibilityHelp.js';
import { AGENT_SESSION_RENAME_ACTION_ID } from '../../../browser/agentSessions/agentSessions.js';

suite('Chat Accessibility Help', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('documents model details and activating Auto through its tiers', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			details: help.includes('selected model\'s details open beside the list'),
			immediatePreview: help.includes('updates the details immediately without selecting a model'),
			inactiveTiers: help.includes('tiers remain visible while Auto is off'),
			activation: help.includes('Enter or Space to choose a tier and turn Auto on'),
		}, { details: true, immediatePreview: true, inactiveTiers: true, activation: true });
	});

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

	test('describes long pasted text attachments', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('Long pasted text'),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes('Long pasted text'),
		}, {
			agentView: true,
			inlineChat: true,
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
			actions: helpText.includes('Go on the Run') && helpText.includes('Grow') && helpText.includes('Shrink') && helpText.includes('Reset Size') && helpText.includes('Stable Colors') && helpText.includes('Insiders Colors'),
			petMovement: helpText.includes('Drag it around the chat with the mouse') && helpText.includes('left and right arrows to make it hop'),
			petHopping: helpText.includes('make it hop along the input until it reaches an edge'),
			petThrowing: helpText.includes('flick it in any direction') && helpText.includes('gravity pulls it down') && helpText.includes('Hold Shift with the left or right arrow to throw it toward a wall'),
			petBouncing: helpText.includes('Pointer collisions are ignored for half a second after a drag release') && helpText.includes('while the pet is falling, move the pointer into it to bounce it upward') && helpText.includes('Sideways and upward travel do not start the bounce counter') && helpText.includes('counter beside the pet tracks consecutive bounces and remains for up to five seconds after landing') && helpText.includes('until the pet next reacts or interacts') && helpText.includes('at least twenty bounces triggers confetti unless reduced motion is enabled') && helpText.includes('press Enter or Space to bounce it upward'),
			petRevival: helpText.includes('a despawn effect appears at the bottom') && helpText.includes('a respawn effect appears at the top') && helpText.includes('automatically returns to the input'),
			petScale: helpText.includes('position and selected size are shared across chats and windows') && helpText.includes('remembered after you restart'),
		}, {
			keybinding: true,
			navigation: true,
			actions: true,
			petMovement: true,
			petHopping: true,
			petThrowing: true,
			petBouncing: true,
			petRevival: true,
			petScale: true,
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
		const shownHelp = getAccessibilityHelpText('agentView', keybindingService, true, false, true);
		const hiddenHelp = getAccessibilityHelpText('agentView', keybindingService, true, false, false);

		assert.deepStrictEqual({
			shown: shownHelp.includes('pinned to the top of the transcript'),
			notShown: hiddenHelp.includes('pinned to the top of the transcript'),
			byDefault: getAccessibilityHelpText('agentView', keybindingService, true).includes('pinned to the top of the transcript'),
			navigationButtons: shownHelp.includes('Go to Previous Prompt') || shownHelp.includes('Go to Next Prompt'),
		}, {
			shown: true,
			notShown: false,
			byDefault: false,
			navigationButtons: false,
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

	test('documents session status pill keyboard interaction', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes('left and right arrow keys to move between pills'),
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('<keybinding:editor.action.showContextMenu>'),
			pullRequestFilter: getAccessibilityHelpText('agentView', keybindingService, true).includes('Pull Requests Options'),
			filterPersistence: getAccessibilityHelpText('agentView', keybindingService, true).includes('remembered across sessions'),
			filterRecovery: getAccessibilityHelpText('agentView', keybindingService, true).includes('toolbar context menu to show all again'),
			agentQuickChat: getAccessibilityHelpText('agentView', keybindingService, true, false, false, false).includes('session status pills'),
			quickChat: getAccessibilityHelpText('quickChat', keybindingService, true).includes('session status pills'),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes('session status pills'),
		}, {
			panelChat: true,
			agentView: true,
			pullRequestFilter: true,
			filterPersistence: true,
			filterRecovery: true,
			agentQuickChat: false,
			quickChat: false,
			inlineChat: false,
		});
	});

	test('documents transcript Find everywhere it is enabled, but not in quick chat', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
			editsView: getAccessibilityHelpText('editsView', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
			quickChat: getAccessibilityHelpText('quickChat', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
		}, {
			panelChat: true,
			agentView: true,
			editsView: true,
			quickChat: false,
			inlineChat: false,
		});
	});

	test('documents session rename where the focused-chat keybinding is enabled', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;
		const keybinding = `<keybinding:${AGENT_SESSION_RENAME_ACTION_ID}>`;

		assert.deepStrictEqual({
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes(keybinding),
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes(keybinding),
			editsView: getAccessibilityHelpText('editsView', keybindingService, true).includes(keybinding),
			afterFirstRequest: getAccessibilityHelpText('agentView', keybindingService, true).includes('Agent Host sessions can be renamed after sending the first request'),
			quickChat: getAccessibilityHelpText('quickChat', keybindingService, true).includes(keybinding),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes(keybinding),
			sessionsWindow: getAccessibilityHelpText('agentView', keybindingService, true, true).includes(keybinding),
		}, {
			panelChat: true,
			agentView: true,
			editsView: true,
			afterFirstRequest: true,
			quickChat: false,
			inlineChat: false,
			sessionsWindow: false,
		});
	});
});
