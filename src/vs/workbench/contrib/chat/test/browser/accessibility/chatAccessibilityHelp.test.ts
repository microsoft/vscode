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
			singleDesktopPet: helpText.includes('one pet moves to the desktop'),
			desktopMovement: helpText.includes('Drag the desktop pet across monitors') && helpText.includes('without changing application focus'),
			desktopActions: helpText.includes('dictate in a new or recent chat') && helpText.includes('go to the selected chat') && helpText.includes('hide the pet'),
			noWorkbenchReveal: helpText.includes('without revealing the main workbench'),
			chatMovement: helpText.includes('flick it horizontally toward a wall') && helpText.includes('Use the left and right arrows to hop'),
		}, {
			keybinding: true,
			singleDesktopPet: true,
			desktopMovement: true,
			desktopActions: true,
			noWorkbenchReveal: true,
			chatMovement: true,
		});
	});

	test('describes the pet composer without implying the workbench is revealed', () => {
		const keybindingService = {
			lookupKeybindings: () => [],
		} as unknown as IKeybindingService;
		const helpText = getAccessibilityHelpText('chatPetInputWindow', keybindingService, false);

		assert.deepStrictEqual({
			hiddenWorkbench: helpText.includes('without revealing the main VS Code window'),
			dictation: helpText.includes('Dictation starts when the input opens'),
			folderPicker: helpText.includes('destination picker appears inside the pet input'),
			failure: helpText.includes('failed send keeps the draft'),
		}, {
			hiddenWorkbench: true,
			dictation: true,
			folderPicker: true,
			failure: true,
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
			chatInputWindow: getAccessibilityHelpText('chatInputWindow', keybindingService, true).includes('<keybinding:workbench.action.chat.find>'),
		}, {
			panelChat: true,
			agentView: true,
			editsView: true,
			quickChat: false,
			inlineChat: false,
			chatInputWindow: false,
		});
	});
});
