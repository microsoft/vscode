/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OS } from '../../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { InputFocusedContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingsRegistry } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeybindingResolver } from '../../../../../../platform/keybinding/common/keybindingResolver.js';
import { ResolvedKeybindingItem } from '../../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import '../../../browser/chatEditing/chatEditingActions.js';

suite('Chat editing keybinding resolution', () => {

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

	function hasPrimaryKeybinding(commandId: string, inputFocused: boolean, textInputFocused: boolean = false): boolean {
		const contextKeyService = new ContextKeyService(new TestConfigurationService());
		try {
			const overlay = contextKeyService.createOverlay([
				[ChatContextKeys.inChatSession.key, true],
				[ChatContextKeys.inChatQuestionCarousel.key, false],
				[ChatContextKeys.readOnly.key, false],
				[EditorContextKeys.textInputFocus.key, textInputFocused],
				[InputFocusedContext.key, inputFocused],
			]);
			const resolver = buildResolverForCommands([commandId]);
			return !!resolver.lookupPrimaryKeybinding(commandId, overlay, true);
		} finally {
			contextKeyService.dispose();
		}
	}

	test('undo-requests and restore-checkpoint keybindings are disabled while any input is focused', () => {
		const commandIds = [
			'workbench.action.chat.undoEdits',
			'workbench.action.chat.editRequests',
			'workbench.action.chat.restoreCheckpoint',
		];

		for (const commandId of commandIds) {
			assert.strictEqual(hasPrimaryKeybinding(commandId, false), true, `${commandId} should be available when inputFocus=false`);
			assert.strictEqual(hasPrimaryKeybinding(commandId, true), false, `${commandId} should be disabled when inputFocus=true`);
			assert.strictEqual(hasPrimaryKeybinding(commandId, false, true), false, `${commandId} should be disabled when textInputFocus=true`);
		}
	});
});
