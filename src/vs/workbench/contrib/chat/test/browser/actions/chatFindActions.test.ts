/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getActiveDocument } from '../../../../../../base/browser/dom.js';
import { OS } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { KeybindingResolver, ResultKind } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IChatFindController, IChatWidget } from '../../../browser/chat.js';
import { registerChatFindActions, resolveFocusedChatWidget } from '../../../browser/actions/chatFindActions.js';
import { ChatFindCommandId } from '../../../browser/widget/chatFind/chatFindCommandIds.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';

function fakeWidget(hasFindController: boolean): IChatWidget {
	return upcastPartial<IChatWidget>({
		domNode: getActiveDocument().createElement('div'),
		getFindController: () => hasFindController ? upcastPartial<IChatFindController>({}) : undefined,
	});
}

suite('resolveFocusedChatWidget', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('prefers the widget whose Find controller currently has DOM focus over lastFocusedWidget', () => {
		const stale = fakeWidget(true);
		const focused = fakeWidget(true);

		const result = resolveFocusedChatWidget([stale, focused], stale, el => el === focused.domNode);

		assert.strictEqual(result, focused, 'must not fall back to the stale lastFocusedWidget when another pane\'s Find owns focus');
	});

	test('ignores widgets without a Find controller even if their DOM has focus', () => {
		const noFind = fakeWidget(false);
		const stale = fakeWidget(true);

		const result = resolveFocusedChatWidget([noFind, stale], stale, el => el === noFind.domNode);

		assert.strictEqual(result, stale);
	});

	test('falls back to lastFocusedWidget when nothing is focused', () => {
		const stale = fakeWidget(true);
		const other = fakeWidget(true);

		const result = resolveFocusedChatWidget([other, stale], stale, () => false);

		assert.strictEqual(result, stale);
	});
});

// Register actions once so the keybindings appear in KeybindingsRegistry.
registerChatFindActions();

suite('Chat Find keybinding resolution', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function buildResolverForCommands(commandIds: string[]): KeybindingResolver {
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

	test('Enter finds next and Shift+Enter finds previous while the find input is focused', () => {
		const config = new TestConfigurationService();
		const ctxService = new ContextKeyService(config);
		const overlay = ctxService.createOverlay([[ChatContextKeys.findInputFocused.key, true]]);
		const resolver = buildResolverForCommands([ChatFindCommandId.FindNext, ChatFindCommandId.FindPrevious]);

		const next = resolver.lookupPrimaryKeybinding(ChatFindCommandId.FindNext, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0];
		const previous = resolver.lookupPrimaryKeybinding(ChatFindCommandId.FindPrevious, overlay, true)?.resolvedKeybinding?.getDispatchChords()[0];

		assert.deepStrictEqual({ next, previous }, { next: 'Enter', previous: 'shift+Enter' });

		ctxService.dispose();
	});

	test('F3 finds next and Shift+F3 finds previous while transcript Find is hidden', () => {
		const config = new TestConfigurationService();
		const ctxService = new ContextKeyService(config);
		const overlay = ctxService.createOverlay([
			[ChatContextKeys.findSupported.key, true],
			[ChatContextKeys.inChatSession.key, true],
		]);
		const resolver = buildResolverForCommands([ChatFindCommandId.FindNext, ChatFindCommandId.FindPrevious]);
		const context = overlay.getContext(null);
		const next = resolver.resolve(context, [], 'F3');
		const previous = resolver.resolve(context, [], 'shift+F3');

		assert.deepStrictEqual({
			next: next.kind === ResultKind.KbFound ? next.commandId : undefined,
			previous: previous.kind === ResultKind.KbFound ? previous.commandId : undefined,
		}, {
			next: ChatFindCommandId.FindNext,
			previous: ChatFindCommandId.FindPrevious,
		});

		ctxService.dispose();
	});

	test('F3 does not override Find Next in an embedded editor', () => {
		const config = new TestConfigurationService();
		const ctxService = new ContextKeyService(config);
		const overlay = ctxService.createOverlay([
			[ChatContextKeys.findSupported.key, true],
			[ChatContextKeys.inChatSession.key, true],
			[EditorContextKeys.focus.key, true],
		]);
		const resolver = buildResolverForCommands([ChatFindCommandId.FindNext]);
		const result = resolver.resolve(overlay.getContext(null), [], 'F3');

		assert.strictEqual(result.kind === ResultKind.KbFound ? result.commandId : undefined, undefined);

		ctxService.dispose();
	});
});
