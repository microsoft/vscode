/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OS } from '../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { ContextKeyService } from '../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../platform/contextkey/common/contextkey.js';
import { TestConfigurationService } from '../../../platform/configuration/test/common/testConfigurationService.js';
import { KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { TerminalCommandId } from '../../../workbench/contrib/terminal/common/terminal.js';
import { TerminalContextKeys } from '../../../workbench/contrib/terminal/common/terminalContextKey.js';
import { registerTerminalActions } from '../../../workbench/contrib/terminal/browser/terminalActions.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../workbench/common/contextkeys.js';
import { SessionHasMultipleOpenChatsContext, SessionIsArchivedContext, SessionIsCreatedContext, SessionSupportsMultipleChatsContext } from '../../common/contextkeys.js';

import '../../contrib/sessions/browser/sessionsActions.js';
import '../../contrib/sessions/browser/views/sessionsViewActions.js';

registerTerminalActions();

suite('Terminal tab cycling keybindings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createResolver(commandIds: string[]): KeybindingResolver {
		const items: ResolvedKeybindingItem[] = [];
		for (const item of KeybindingsRegistry.getDefaultKeybindingsForOS(OS)) {
			if (!item.command || !commandIds.includes(item.command) || !item.keybinding) {
				continue;
			}
			const resolved = USLayoutResolvedKeybinding.resolveKeybinding(item.keybinding, OS)[0];
			items.push(new ResolvedKeybindingItem(resolved, item.command, item.commandArgs, item.when ?? undefined, true, null, false));
		}
		return new KeybindingResolver(items, [], () => { });
	}

	function createContext(terminalFocus: boolean): { readonly context: ContextKeyService; readonly overlay: IContextKeyService } {
		const context = new ContextKeyService(new TestConfigurationService());
		return {
			context,
			overlay: context.createOverlay([
				[IsSessionsWindowContext.key, true],
				[EditorAreaFocusContext.key, false],
				[TerminalContextKeys.processSupported.key, true],
				[TerminalContextKeys.focus.key, terminalFocus],
				[TerminalContextKeys.editorFocus.key, false],
				[SessionIsCreatedContext.key, true],
				[SessionSupportsMultipleChatsContext.key, true],
				[SessionHasMultipleOpenChatsContext.key, true],
				[SessionIsArchivedContext.key, false],
			]),
		};
	}

	test('terminal focus keeps chat/session cycling out of the binding set', () => {
		const resolver = createResolver([
			TerminalCommandId.FocusNext,
			TerminalCommandId.FocusPrevious,
			'sessions.chatCompositeBar.navigateNextChat',
			'sessions.chatCompositeBar.navigatePreviousChat',
			'sessionsViewPane.navigateNextSession',
			'sessionsViewPane.navigatePreviousSession',
		]);
		const { context, overlay } = createContext(true);
		try {
			assert.deepStrictEqual({
				terminalNext: resolver.lookupPrimaryKeybinding(TerminalCommandId.FocusNext, overlay, true) !== null,
				terminalPrevious: resolver.lookupPrimaryKeybinding(TerminalCommandId.FocusPrevious, overlay, true) !== null,
				chatNext: resolver.lookupPrimaryKeybinding('sessions.chatCompositeBar.navigateNextChat', overlay, true) !== null,
				chatPrevious: resolver.lookupPrimaryKeybinding('sessions.chatCompositeBar.navigatePreviousChat', overlay, true) !== null,
				sessionNext: resolver.lookupPrimaryKeybinding('sessionsViewPane.navigateNextSession', overlay, true) !== null,
				sessionPrevious: resolver.lookupPrimaryKeybinding('sessionsViewPane.navigatePreviousSession', overlay, true) !== null,
			}, {
				terminalNext: true,
				terminalPrevious: true,
				chatNext: false,
				chatPrevious: false,
				sessionNext: false,
				sessionPrevious: false,
			});
		} finally {
			context.dispose();
		}
	});

	test('non-terminal focus keeps terminal cycling out of the binding set', () => {
		const resolver = createResolver([
			TerminalCommandId.FocusNext,
			TerminalCommandId.FocusPrevious,
			'sessions.chatCompositeBar.navigateNextChat',
			'sessions.chatCompositeBar.navigatePreviousChat',
			'sessionsViewPane.navigateNextSession',
			'sessionsViewPane.navigatePreviousSession',
		]);
		const { context, overlay } = createContext(false);
		try {
			assert.deepStrictEqual({
				terminalNext: resolver.lookupPrimaryKeybinding(TerminalCommandId.FocusNext, overlay, true) !== null,
				terminalPrevious: resolver.lookupPrimaryKeybinding(TerminalCommandId.FocusPrevious, overlay, true) !== null,
				chatNext: resolver.lookupPrimaryKeybinding('sessions.chatCompositeBar.navigateNextChat', overlay, true) !== null,
				chatPrevious: resolver.lookupPrimaryKeybinding('sessions.chatCompositeBar.navigatePreviousChat', overlay, true) !== null,
				sessionNext: resolver.lookupPrimaryKeybinding('sessionsViewPane.navigateNextSession', overlay, true) !== null,
				sessionPrevious: resolver.lookupPrimaryKeybinding('sessionsViewPane.navigatePreviousSession', overlay, true) !== null,
			}, {
				terminalNext: false,
				terminalPrevious: false,
				chatNext: true,
				chatPrevious: true,
				sessionNext: true,
				sessionPrevious: true,
			});
		} finally {
			context.dispose();
		}
	});
});
