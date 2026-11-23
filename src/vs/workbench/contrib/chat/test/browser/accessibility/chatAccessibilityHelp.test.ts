/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatSessionArchiveActionWording } from '../../../../../../platform/chat/common/sessionArchiveActions.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { getAccessibilityHelpText } from '../../../browser/actions/chatAccessibilityHelp.js';
import { AGENT_SESSION_RENAME_ACTION_ID } from '../../../browser/agentSessions/agentSessions.js';
import { isResponseSelectionSupported } from '../../../browser/chat.js';

suite('Chat Accessibility Help', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps confirmation and reading guidance without implementation guarantees', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			confirmation: help.includes('<keybinding:workbench.action.chat.focusConfirmation>'),
			explainCondition: help.includes('In a conversation that supports side chats, when a terminal command needs approval'),
			reasoning: help.includes('Focus a thinking header and press Enter or Space'),
			accessibleReasoning: help.includes('Reasoning content is also available in Accessible View'),
			spokenProgressSetting: help.includes('accessibility.verboseChatProgressUpdates'),
			implementationDetails: /authentication progress and its outcome|extracted reasoning heading|Legacy thinking presentation|parabolic ribbon|reserved space/.test(help),
		}, {
			confirmation: true, explainCondition: true, reasoning: true, accessibleReasoning: true, spokenProgressSetting: true, implementationDetails: false,
		});
	});

	test('keeps model configuration navigation on supported surfaces', () => {
		assert.deepStrictEqual((['panelChat', 'agentView', 'editsView', 'quickChat', 'inlineChat'] as const).map(type => {
			const help = getAccessibilityHelpText(type, new MockKeybindingService(), true);
			return {
				details: help.includes('Right Arrow, or Tab to its configuration button and Enter or Space'),
				back: help.includes('returns focus to the model list'),
				configure: help.includes('Arrow keys focus options; Enter or Space selects one'),
				scroll: help.includes('Use Page Up or Page Down while model details have focus'),
			};
		}), [true, true, true, true, false].map(available => ({
			details: available, back: available, configure: available, scroll: available,
		})));
	});

	test('keeps image navigation and saving without decorative progress descriptions', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			open: help.includes('Tab or Shift+Tab to focus an image and Enter to open it'),
			save: help.includes('Use its Save action to save the generated image'),
			batch: help.includes('Left or Right Arrow, Home, or End to select another image'),
			download: help.includes('Enter or Space to save ready images as a ZIP archive'),
			carousel: help.includes('Use the Left and Right Arrow keys to move between images'),
			decoration: /glyph-to-image|painting-themed|selected thumbnail has a highlighted border/.test(help),
		}, { open: true, save: true, batch: true, download: true, carousel: true, decoration: false });
	});

	test('only includes on-device navigation while on-device models are enabled', () => {
		assert.deepStrictEqual([false, true].map(enabled => {
			const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, false, undefined, false, enabled);
			return {
				tab: help.includes('model picker offers On This Device'),
				state: help.includes('A model\'s accessible label includes its state'),
				notice: help.includes('An on-device model notice above the input offers actions'),
				headerActions: help.includes('Left and Right Arrow in the header to reach model actions such as Load, Stop, Update, and Remove'),
			};
		}), [false, true].map(enabled => ({ tab: enabled, state: enabled, notice: enabled, headerActions: enabled })));
	});

	test('only includes archive navigation while its suggestion is shown and uses configured wording', () => {
		const help = (shown: boolean, wording: ChatSessionArchiveActionWording) =>
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, shown, wording);
		assert.deepStrictEqual([
			help(false, ChatSessionArchiveActionWording.Archive),
			help(true, ChatSessionArchiveActionWording.Archive),
			help(true, ChatSessionArchiveActionWording.MarkAsDone),
		].map(content => ({
			archive: content.includes('Dismiss Archive Suggestion'),
			done: content.includes('Dismiss Mark as Done Suggestion'),
			readExplanation: content.includes('Enter or Space to read its explanation'),
		})), [
			{ archive: false, done: false, readExplanation: false },
			{ archive: true, done: false, readExplanation: true },
			{ archive: false, done: true, readExplanation: true },
		]);
	});

	test('keeps keyboard alternatives for attachments, worktrees, and the pet', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, false, undefined, false, false, undefined, false, false, true, true);
		assert.deepStrictEqual({
			attachmentMove: help.split('\n').find(line => line.startsWith('To move an inline pill with the keyboard')),
			worktree: help.includes('Use Tab to reach it and Space to check or uncheck it'),
			pet: help.includes('Use Tab to focus it, Left and Right Arrow to move it'),
			visualPhysics: /Pointer collisions|gravity pulls|confetti|opaque hex/.test(help),
		}, {
			attachmentMove: 'To move an inline pill with the keyboard, select it with Shift and an arrow key, cut<keybinding:editor.action.clipboardCutAction>, move the cursor, and paste<keybinding:editor.action.clipboardPasteAction>.',
			worktree: true, pet: true, visualPhysics: false,
		});
	});

	test('keeps remote connection navigation only on persistent chat surfaces', () => {
		assert.deepStrictEqual((['panelChat', 'agentView', 'editsView', 'quickChat', 'inlineChat'] as const).map(type => {
			const help = getAccessibilityHelpText(type, new MockKeybindingService(), true);
			return {
				open: help.includes('arrow keys in the title bar, Enter or Space to open it'),
				rename: help.includes('press Tab to reach the name link in the footer'),
				policy: help.includes('Press Tab to reach View Setting'),
			};
		}), [true, true, true, false, false].map(available => ({ open: available, rename: available, policy: available })));
	});

	test('documents paste choices only on the supported workbench chat surfaces', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('panelChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true),
			getAccessibilityHelpText('editsView', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true),
		].map(help => help.includes('<keybinding:editor.changePasteType>')), [true, true, true, false, false, true]);
	});

	test('documents showing files above the chat input only while chat resources are enabled', () => {
		const help = (chatResourcesEnabled: boolean) => getAccessibilityHelpText('panelChat', new MockKeybindingService(), true, false, false, true, false, undefined, false, false, undefined, false, false, true, false, chatResourcesEnabled);
		assert.deepStrictEqual([help(false), help(true)].map(text => text.includes('Show Above Chat Input')), [false, true]);
	});

	test('documents side chats in the side panel only in the Agents window while side chats show there', () => {
		const help = (type: 'agentView' | 'inlineChat', sessionsWindow: boolean, sideChatsInSidePane: boolean) => getAccessibilityHelpText(type, new MockKeybindingService(), true, sessionsWindow, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, sideChatsInSidePane);
		assert.deepStrictEqual([
			help('agentView', true, true),
			help('agentView', true, false),
			help('agentView', false, true),
			help('inlineChat', true, true),
		].map(text => text.includes('open as tabs of the side panel')), [true, false, false, false]);
	});

	test('documents the prompt timeline handle only while it is shown', () => {
		const help = (promptTimelineGutterShown: boolean) => getAccessibilityHelpText('panelChat', new MockKeybindingService(), true, false, false, true, false, undefined, false, false, undefined, false, false, true, false, false, false, false, promptTimelineGutterShown);
		assert.deepStrictEqual([help(false), help(true)].map(text => text.includes('A handle on the left edge of the transcript lists your prompts')), [false, true]);
	});

	test('documents sandbox approval navigation in both windows', () => {
		assert.deepStrictEqual([false, true].map(sessionsWindow => {
			const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, sessionsWindow);
			return {
				keyboard: help.includes('Enter or Space to open the approval dropdown') && help.includes('Escape closes the dropdown without approving'),
				scope: help.includes('Up or Down Arrow to choose an available scope, and Enter to approve'),
			};
		}), Array.from({ length: 2 }, () => ({ keyboard: true, scope: true })));
	});

	test('documents the file chooser on chat surfaces with Add Context', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('panelChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true),
			getAccessibilityHelpText('editsView', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true),
		].map(help => help.includes('choose Files')
			&& help.includes('<keybinding:workbench.action.chat.attachContext>')
			&& help.includes('checkboxes or Space to select items')
			&& help.includes('Closing the dialog returns focus to the chat input')), [true, true, true, true, true, true]);
	});

	test('explains source labels for same-named Agent Host agents', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('panelChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true),
		].map(help => help.includes('each entry includes its source') && help.includes('file name or location')), [true, true, false, false]);
	});

	test('documents opening session links from the input without sending', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), false);
		assert.deepStrictEqual({
			withoutSending: help.includes('opened without sending your message'),
			keyboard: help.includes('<keybinding:editor.action.openLink>'),
			sentMessage: help.includes('In a sent message, a session link shows the title and status'),
		}, { withoutSending: true, keyboard: true, sentMessage: true });
	});

	test('documents the shared picker and startup lock for Cloud drafts', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), false);
		assert.deepStrictEqual({
			cloud: help.includes('or a new Cloud session'),
			keyboard: help.includes('Tab reaches separate Mode and Permissions buttons'),
			locked: help.includes('Cloud draft choices are locked while the first request starts the session'),
			focus: help.includes('Escape closes the picker and returns focus to the button that opened it'),
		}, { cloud: true, keyboard: true, locked: true, focus: true });
	});

	test('documents side questions and concurrent responses in both windows but not inline or quick chat', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('panelChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true),
			getAccessibilityHelpText('editsView', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true),
		].map(help => help.includes('/btw followed by a question') && help.includes('while a response is in progress')), [true, true, true, true, false, false]);
	});

	test('explains the disabled Local harness only on editor chat surfaces', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true),
			getAccessibilityHelpText('panelChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('editsView', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true),
		].map(help => help.includes('it remains in the harness picker as a disabled option') && help.includes('Use Tab to reach its Learn why link and Enter to open policy guidance')), [true, true, true, false, false, false]);
	});

	test('documents the session working set while preserving existing editor guidance', () => {
		const read = (sessionWorkingSetUndo: boolean) => {
			const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, false, ChatSessionArchiveActionWording.Archive, false, false, undefined, true, sessionWorkingSetUndo);
			return {
				sessionChanges: help.includes('changes across the whole session instead of showing a Changes pill'),
				disclosure: help.includes('Enter or Space to expand or collapse it'),
				openFile: help.includes('Up and Down Arrow to choose a file, and Enter to open it in a regular editor at its first edit.'),
				headingActions: help.includes('The Keep, Undo, and View All Edits buttons after the heading keep or undo the changes to every file in the working set, or open all of them in a diff editor')
					? 'Keep, Undo, View All Edits'
					: help.includes('The Keep and View All Edits buttons after the heading keep the changes to every file in the working set, or open all of them in a diff editor') ? 'Keep, View All Edits' : undefined,
				fileActions: help.includes('Left and Right Arrow to move between Keep, Undo, and Open Changes in Diff Editor')
					? 'Keep, Undo, Open Changes in Diff Editor'
					: help.includes('Left and Right Arrow to move between Keep and Open Changes in Diff Editor') ? 'Keep, Open Changes in Diff Editor' : undefined,
				editorNavigation: help.includes('Navigate between edits in the editor'),
				editorSignals: help.includes('Sounds will play when a change is accepted or undone'),
			};
		};
		const common = { sessionChanges: true, disclosure: true, openFile: true, editorNavigation: true, editorSignals: true };
		assert.deepStrictEqual([read(false), read(true)], [
			{ ...common, headingActions: 'Keep, View All Edits', fileActions: 'Keep, Open Changes in Diff Editor' },
			{ ...common, headingActions: 'Keep, Undo, View All Edits', fileActions: 'Keep, Undo, Open Changes in Diff Editor' },
		]);
	});

	test('does not describe the editor working set on other chat surfaces', () => {
		assert.deepStrictEqual([
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true),
			getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true, false, true, false, ChatSessionArchiveActionWording.Archive, false, false, undefined, true),
			getAccessibilityHelpText('inlineChat', new MockKeybindingService(), true, false, false, false, false, ChatSessionArchiveActionWording.Archive, false, false, undefined, true),
			getAccessibilityHelpText('quickChat', new MockKeybindingService(), true, false, false, false, false, ChatSessionArchiveActionWording.Archive, false, false, undefined, true),
		].map(help => help.includes('changes across the whole session instead of showing a Changes pill') || help.includes('press Tab to reach its Keep button')), [false, false, false, false]);
	});

	test('explains the context menu and read-only actions when Keep and Undo is hidden', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, false, false, true, false, ChatSessionArchiveActionWording.Archive, false, false, undefined, true, true, false);
		assert.deepStrictEqual({
			contextMenu: help.includes('Shift+F10 or the Context Menu key'),
			toggle: help.includes('Keep and Undo toggles review controls'),
			hidden: help.includes('Keep and Undo are hidden in both'),
			pill: help.includes('Show Pill replaces the working set'),
			restore: help.includes('Use Show Working Set in that pill\'s context menu'),
			noKeepButton: !help.includes('Press Tab to reach a file\'s Keep button'),
		}, { contextMenu: true, toggle: true, hidden: true, pill: true, restore: true, noKeepButton: true });
	});

	for (const type of ['panelChat', 'agentView', 'editsView', 'inlineChat', 'quickChat'] as const) {

		test(`only describes visible Codex continuation UI (${type})`, () => {
			const keybindings = new MockKeybindingService();
			const hidden = getAccessibilityHelpText(type, keybindings, false);
			const shown = getAccessibilityHelpText(type, keybindings, false, false, false, false, false, ChatSessionArchiveActionWording.Archive, true);
			assert.deepStrictEqual({
				hidden: hidden.includes('A ChatGPT limit suggestion'),
				shown: shown.includes('A ChatGPT limit suggestion'),
			}, { hidden: false, shown: type !== 'inlineChat' && type !== 'quickChat' });
		});
	}

	test('documents the sandbox policy command and report link', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.ok(help.includes('use /sandbox policy to view the effective sandbox policy. In the response, use Tab to focus Open Sandbox Policy and Enter to open the formatted report.'));
	});

	test('documents keyboard access to sandbox diagnostic actions', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.ok(help.includes('use Tab to reach Troubleshooting Guide or, when permitted, Disable Sandboxing. Press Enter or Space to activate the button.'));
	});

	test('documents the canvas menu and pill only for editor window session pills', () => {
		const keybindings = new MockKeybindingService();
		const canvasesPill = 'The Canvas pill opens directly for one canvas';
		assert.deepStrictEqual(
			(['panelChat', 'agentView', 'editsView', 'inlineChat', 'quickChat'] as const).map(type => [
				getAccessibilityHelpText(type, keybindings, false).includes(canvasesPill),
				getAccessibilityHelpText(type, keybindings, false).includes('Use Canvas in the New Chat menu'),
				getAccessibilityHelpText(type, keybindings, false, true).includes(canvasesPill),
			]),
			[[true, true, false], [true, true, false], [false, false, false], [false, false, false], [false, false, false]],
		);
	});

	test('documents Add Context canvas navigation in Editor and Agents windows', () => {
		const keybindings = new MockKeybindingService();
		assert.deepStrictEqual(
			[false, true].map(isSessionsWindow => {
				const help = getAccessibilityHelpText('panelChat', keybindings, false, isSessionsWindow);
				return [
					help.includes('Add Context includes Canvas immediately after Sessions'),
					help.includes('it does not attach anything to the prompt'),
				];
			}),
			[[true, true], [true, true]],
		);
	});

	for (const isSessionsWindow of [false, true]) {
		test(`documents the remote BYOK warning only in the editor (isSessionsWindow: ${isSessionsWindow})`, () => {
			const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), false, isSessionsWindow);
			assert.deepStrictEqual({
				keyboard: help.includes('Use Tab to reach Dismiss notification or Don\'t Show Again, then Enter or Space to activate it.'),
				oncePerWindow: help.includes('The warning does not repeat in other chats in the same window.'),
				persistence: help.includes('Don\'t Show Again permanently hides this warning for your profile, including when new models are added.'),
			}, { keyboard: !isSessionsWindow, oncePerWindow: !isSessionsWindow, persistence: !isSessionsWindow });
		});
	}

	test('documents opening, attaching, and copying images shown in responses', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			open: help.includes('To open a file image shown in a response, use Tab to focus it and press Enter or Space'),
			attach: help.includes('drag it into the chat input, or use Copy Image and paste it into the input'),
			copy: help.includes('press Shift+F10 to open its context menu, then choose Copy Image'),
			path: help.includes('For images stored in a file, Copy Image Path copies the file path'),
		}, { open: true, attach: true, copy: true, path: true });
	});
	for (const type of ['panelChat', 'editsView', 'agentView'] as const) {
		test(`documents skipping MCP startup only on supported surfaces (${type})`, () => {
			const help = getAccessibilityHelpText(type, new MockKeybindingService(), false);
			assert.strictEqual(help.includes('When a chat turn is waiting for MCP servers to start, a Skip link may appear. Use Tab to focus Skip and press Enter or Space to continue the turn while those servers start in the background. The current startup message disappears immediately and focus returns to the chat input. New server startups may show another message.'), type !== 'editsView');
		});
	}

	test('documents accepting the selected confirmation primary action', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			primaryAction: help.includes('activates the primary button of the selected confirmation'),
			disabled: help.includes('Disabled actions cannot be accepted'),
			keybinding: help.includes('<keybinding:workbench.action.chat.acceptTool>'),
		}, { primaryAction: true, disabled: true, keybinding: true });
	});

	test('documents keyboard access to subagent chats and inline details', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			focus: help.includes('Use Tab to focus a subagent pill'),
			open: help.includes('Enter or Space to open its chat to the side'),
			inline: help.includes('Enter or Space expands or collapses its inline details'),
			status: help.includes('announces its running state') && help.includes('any pending confirmations'),
			modelSettings: help.includes('model settings'),
			resourceLinks: help.includes('File and markdown links in its activity row can be focused with Tab'),
			nestedSubagent: help.includes('press Enter or Space to open the nested subagent\'s chat to the side'),
		}, { focus: true, open: true, inline: true, status: true, modelSettings: true, resourceLinks: true, nestedSubagent: true });
	});

	test('explains organization-managed defaults separately from this chat selection', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true);
		assert.deepStrictEqual({
			managedDefault: help.includes('Org default identifies the model your organization sets for new chats'),
			perChatChoice: help.includes('the checkmark identifies your current selection'),
			auto: help.includes('Auto carries the same label when it is the organization default'),
		}, { managedDefault: true, perChatChoice: true, auto: true });
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

	test('only describes inline attachment references when supported', () => {
		const keybindingService = new MockKeybindingService();

		assert.deepStrictEqual({
			supported: getAccessibilityHelpText('agentView', keybindingService, true).includes('type # or @'),
			unsupported: getAccessibilityHelpText('agentView', keybindingService, false).includes('type # or @'),
		}, {
			supported: true,
			unsupported: false,
		});
	});

	test('describes long pasted text attachments regardless of line count', () => {
		const keybindingService = new MockKeybindingService();

		assert.deepStrictEqual({
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes('Long pasted text, including single-line text'),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes('Long pasted text, including single-line text'),
		}, {
			agentView: true,
			inlineChat: true,
		});
	});

	test('describes selection side chats in both windows', () => {
		const keybindingService = new MockKeybindingService();

		assert.deepStrictEqual({
			sessionsWindow: getAccessibilityHelpText('agentView', keybindingService, true, true).includes('Ask Question'),
			regularWindow: getAccessibilityHelpText('agentView', keybindingService, true, false).includes('Ask Question'),
		}, {
			sessionsWindow: isResponseSelectionSupported(),
			regularWindow: isResponseSelectionSupported(),
		});
	});

	test('documents the editor selection action and quote without describing transient chats', () => {
		const help = (type: 'agentView' | 'quickChat' | 'inlineChat') => getAccessibilityHelpText(type, new MockKeybindingService(), true, false, false, true, false, ChatSessionArchiveActionWording.Archive, false, false, true);
		assert.deepStrictEqual({
			editor: help('agentView').includes('Choose Ask in Side Chat... to open a small Ask Question input'),
			quote: help('agentView').includes('through the selected response and its quoted text'),
			keyboard: help('agentView').includes('context menu with Shift+F10 or the context menu key'),
			quick: help('quickChat').includes('Ask Question'),
			inline: help('inlineChat').includes('Ask Question'),
		}, { editor: true, quote: true, keyboard: true, quick: false, inline: false });
	});

	test('omits mobile-web selection pop-up help without hiding other sessions help', () => {
		const help = getAccessibilityHelpText('agentView', new MockKeybindingService(), true, true, false, true, false, ChatSessionArchiveActionWording.Archive, false, false, isResponseSelectionSupported({ isWeb: true, isMobile: true }));

		assert.deepStrictEqual({
			selectionPopUp: help.includes('Ask Question'),
			requestOrigin: help.includes('Some requests include a source chat button'),
			sessionResults: help.includes('Completed create-session, create-chat, and send-message operations'),
		}, {
			selectionPopUp: false,
			requestOrigin: true,
			sessionResults: true,
		});
	});

	test('only describes session result pill activation in the sessions window', () => {
		const keybindingService = new MockKeybindingService();
		const describe = (help: string) => ({
			focus: help.includes('target session or chat button in the response. Use Tab to focus it'),
			open: help.includes('Enter or Space to open it normally'),
			openToSide: help.includes('Alt+Enter (Option+Enter on macOS) to open it to the side'),
		});

		assert.deepStrictEqual({
			sessionsWindow: describe(getAccessibilityHelpText('agentView', keybindingService, true, true)),
			regularWindow: describe(getAccessibilityHelpText('agentView', keybindingService, true, false)),
		}, {
			sessionsWindow: { focus: true, open: true, openToSide: true },
			regularWindow: { focus: false, open: false, openToSide: false },
		});
	});

	test('only describes the sticky prompt header when it is shown', () => {
		const keybindingService = new MockKeybindingService();
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

	test('only documents customization migration entry points in panel chat', () => {
		const keybindingService = new MockKeybindingService();
		const expectedText = 'notice above the new-chat input';

		assert.deepStrictEqual({
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes(expectedText),
			quickChat: getAccessibilityHelpText('quickChat', keybindingService, true).includes(expectedText),
			agentView: getAccessibilityHelpText('agentView', keybindingService, true).includes(expectedText),
		}, {
			panelChat: true,
			quickChat: false,
			agentView: false,
		});
	});

	test('documents full terminal output in chat surfaces that render terminal tools', () => {
		const keybindingService = new MockKeybindingService();
		const expectedText = 'Open Full Output (Read-Only) action';
		const agentViewText = getAccessibilityHelpText('agentView', keybindingService, true);

		assert.deepStrictEqual({
			panelChat: getAccessibilityHelpText('panelChat', keybindingService, true).includes(expectedText),
			quickChat: getAccessibilityHelpText('quickChat', keybindingService, true).includes(expectedText),
			agentView: agentViewText.includes(expectedText),
			inlineChat: getAccessibilityHelpText('inlineChat', keybindingService, true).includes(expectedText),
			editsView: getAccessibilityHelpText('editsView', keybindingService, true).includes(expectedText),
			viewFullOutputLink: agentViewText.includes('View Full Output link below the output preview'),
			outputEnter: agentViewText.includes('focus the output region and press Enter'),
			readonly: agentViewText.includes('read-only editor'),
			accessibleView: agentViewText.includes('terminal output Accessible View'),
		}, {
			panelChat: true,
			quickChat: true,
			agentView: true,
			inlineChat: false,
			editsView: false,
			viewFullOutputLink: true,
			outputEnter: true,
			readonly: true,
			accessibleView: true,
		});
	});

	test('documents transcript Find everywhere it is enabled, but not in quick chat', () => {
		const keybindingService = new MockKeybindingService();

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

	test('documents session read shortcuts only for persistent editor-window chats', () => {
		const keybindingService = new MockKeybindingService();
		const containsShortcuts = (type: 'panelChat' | 'agentView' | 'editsView' | 'quickChat' | 'inlineChat', isSessionsWindow = false) => {
			const content = getAccessibilityHelpText(type, keybindingService, true, isSessionsWindow);
			return content.includes('as read<keybinding:agentSession.markRead>')
				&& content.includes('or unread<keybinding:agentSession.markUnread> without opening them')
				&& content.includes('change only the targeted nested sessions, not their parent');
		};
		assert.deepStrictEqual({
			panel: containsShortcuts('panelChat'),
			agent: containsShortcuts('agentView'),
			edits: containsShortcuts('editsView'),
			quick: containsShortcuts('quickChat'),
			inline: containsShortcuts('inlineChat'),
			agentsWindow: containsShortcuts('agentView', true),
		}, { panel: true, agent: true, edits: true, quick: false, inline: false, agentsWindow: false });
	});

	test('documents session rename where the focused-chat keybinding is enabled', () => {
		const keybindingService = new MockKeybindingService();
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
