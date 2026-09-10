/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording } from '../../../../../../platform/chat/common/sessionArchiveActions.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { getAccessibilityHelpText } from '../../../browser/actions/chatAccessibilityHelp.js';
import { AGENT_SESSION_RENAME_ACTION_ID } from '../../../browser/agentSessions/agentSessions.js';

suite('Chat Accessibility Help', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('documents model details and activating Auto through Optimize for', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			details: help.includes('selected model\'s details open beside the list'),
			immediatePreview: help.includes('updates the details immediately without selecting a model'),
			inactivePreferences: help.includes('Efficiency, Balance, and Intelligence remain visible while Auto is off'),
			mutedPreferences: help.includes('They look muted while off but remain interactive'),
			activation: help.includes('Enter or Space to choose a preference and turn Auto on'),
		}, { details: true, immediatePreview: true, inactivePreferences: true, mutedPreferences: true, activation: true });
	});

	test('documents keyboard search in the model picker', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			typing: help.includes('Type while the model list is focused to search across all providers'),
			navigation: help.includes('Up and Down Arrow to navigate results'),
			selection: help.includes('Enter to select a model, and Escape to close the picker'),
			editing: help.includes('Left and Right Arrow move the text cursor'),
		}, { typing: true, navigation: true, selection: true, editing: true });
	});

	test('documents stationary model configuration and pinning with explicit dismissal', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			discovery: help.includes('Reset to Default appears beside Pin Model when thinking effort or context has been changed'),
			reset: help.includes('restores both settings to the model\'s defaults without changing its pinned state'),
			staysOpen: help.includes('resetting the settings selects that model and keeps its details open'),
			pinning: help.includes('Pinning or unpinning moves the model in the list without moving its details or keyboard focus'),
			dismissal: help.includes('Escape again to close the picker'),
		}, { discovery: true, reset: true, staysOpen: true, pinning: true, dismissal: true });
	});

	test('documents stable pricing expansion and keyboard scrolling', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			expansion: help.includes('Pricing Details expands in place without moving the model\'s controls'),
			scrolling: help.includes('use Page Up or Page Down while the model details have focus to scroll'),
			reducedMotion: help.includes('Expansion and collapse are immediate when reduced motion is enabled'),
		}, { expansion: true, scrolling: true, reducedMotion: true });
	});

	test('documents the archive suggestion only while it is shown', () => {
		const keybindingService = new MockKeybindingService();
		const shown = getAccessibilityHelpText('agentView', keybindingService, true, false, false, true, true);
		const hidden = getAccessibilityHelpText('agentView', keybindingService, true);

		assert.deepStrictEqual({
			shown: shown.includes('An archive suggestion appears'),
			hidden: hidden.includes('An archive suggestion appears'),
			keyboard: shown.includes('Tab or Shift+Tab to reach Archive, Configure Automatic Cleanup, or Dismiss Archive Suggestion, then press Enter or Space'),
			cleanupSettings: shown.includes('Configure Automatic Cleanup opens the settings for automatically archiving inactive merged sessions and permanently deleting automatically archived merged sessions'),
			disclosure: shown.includes('What Does "Archive" Do? is collapsed by default'),
			disclosureKeyboard: shown.includes('Enter or Space to expand or collapse it'),
			focus: shown.includes('Escape while it is focused, returns to the chat input'),
			focusRemainingTasks: shown.includes('hides it from the sessions list so you can focus on your remaining tasks'),
			retained: shown.includes('The session is not deleted'),
			agentRecovery: shown.includes('Ask your agent to find it'),
			recovery: shown.includes('"Archived" section of the sessions list. You can unarchive it anytime'),
			worktree: shown.includes('worktree created for the session, if any, will be deleted. You can recreate it by unarchiving the session'),
		}, {
			shown: true,
			hidden: false,
			keyboard: true,
			cleanupSettings: true,
			disclosure: true,
			disclosureKeyboard: true,
			focus: true,
			focusRemainingTasks: true,
			retained: true,
			agentRecovery: true,
			recovery: true,
			worktree: true,
		});
	});

	test('describes read-only thinking previews and keyboard expansion', () => {
		const help = getAccessibilityHelpText('panelChat', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			readOnlyPreview: help.includes('In read-only chats, thinking details preview while streaming and collapse when finished'),
			settingOverride: help.includes('regardless of your thinking-style setting'),
			keyboardExpansion: help.includes('Focus a thinking header and press Enter or Space to expand or collapse its details'),
		}, { readOnlyPreview: true, settingOverride: true, keyboardExpansion: true });
	});

	test('uses the configured Mark as Done wording for nudge help', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, true, ChatSessionArchiveActionWording.MarkAsDone);
		assert.deepStrictEqual({
			keyboard: help.includes('Tab or Shift+Tab to reach Mark as Done, Configure Automatic Cleanup, or Dismiss Mark as Done Suggestion'),
			cleanupSettings: help.includes('Configure Automatic Cleanup opens the settings for automatically archiving inactive merged sessions and permanently deleting automatically archived merged sessions'),
			disclosure: help.includes('What Does "Mark as Done" Do? is collapsed by default'),
			focusRemainingTasks: help.includes('hides it from the sessions list so you can focus on your remaining tasks'),
			retained: help.includes('The session is not deleted'),
			agentRecovery: help.includes('Ask your agent to find it'),
			recovery: help.includes('"Done" section of the sessions list. You can restore it anytime'),
			worktree: help.includes('worktree created for the session, if any, will be deleted. You can recreate it by restoring the session'),
			archiveDisclosure: help.includes('What Does "Archive" Do?'),
		}, { keyboard: true, cleanupSettings: true, disclosure: true, focusRemainingTasks: true, retained: true, agentRecovery: true, recovery: true, worktree: true, archiveDisclosure: false });
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

	test('describes long pasted text attachments regardless of line count', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;

		assert.deepStrictEqual({
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('Long pasted text, including single-line text'),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes('Long pasted text, including single-line text'),
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
