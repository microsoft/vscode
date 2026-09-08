/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { resolveChatModeForView, withPersistedUnavailableChatMode } from '../../../../browser/widget/input/chatModeSelectionLogic.js';
import { ChatMode, type IChatMode } from '../../../../common/chatModes.js';
import { ChatModeKind } from '../../../../common/constants.js';
import type { IChatModelInputState } from '../../../../common/model/chatModel.js';

suite('chatModeSelectionLogic', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves unavailable custom selections but stores built-in fallbacks', () => {
		const customMode = upcastPartial<IChatMode>({
			id: 'file:///data.md',
			kind: ChatModeKind.Agent,
			isBuiltin: false,
		});

		assert.deepStrictEqual({
			availableCustom: resolveChatModeForView({ id: customMode.id, kind: customMode.kind }, customMode, true, true),
			unavailableCustom: resolveChatModeForView({ id: customMode.id, kind: customMode.kind }, undefined, true, true),
			disabledCustom: resolveChatModeForView({ id: customMode.id, kind: customMode.kind }, customMode, false, false),
			customWithoutAgentRuntime: resolveChatModeForView({ id: customMode.id, kind: customMode.kind }, customMode, true, false),
			explicitBuiltinAgent: resolveChatModeForView({ id: ChatMode.Agent.id, kind: ChatModeKind.Agent }, ChatMode.Agent, true, true),
			unavailableBuiltin: resolveChatModeForView({ id: ChatMode.Edit.id, kind: ChatModeKind.Edit }, undefined, true, true),
			unavailableBuiltinWithoutAgent: resolveChatModeForView({ id: ChatMode.Agent.id, kind: ChatModeKind.Agent }, undefined, true, false),
			disabledBuiltinAgent: resolveChatModeForView({ id: ChatMode.Agent.id, kind: ChatModeKind.Agent }, ChatMode.Agent, false, false),
			persistedFallback: withPersistedUnavailableChatMode(
				upcastPartial<IChatModelInputState>({ mode: { id: ChatMode.Agent.id, kind: ChatModeKind.Agent } }),
				{ id: customMode.id, kind: customMode.kind },
			).mode,
		}, {
			availableCustom: {
				modeId: customMode.id,
				unavailableCustomMode: undefined,
				storeSelection: false,
			},
			unavailableCustom: {
				modeId: ChatMode.Agent.id,
				unavailableCustomMode: { id: customMode.id, kind: customMode.kind },
				storeSelection: false,
			},
			customWithoutAgentRuntime: {
				modeId: ChatMode.Ask.id,
				unavailableCustomMode: { id: customMode.id, kind: customMode.kind },
				storeSelection: false,
			},
			disabledCustom: {
				modeId: ChatMode.Ask.id,
				unavailableCustomMode: { id: customMode.id, kind: customMode.kind },
				storeSelection: false,
			},
			explicitBuiltinAgent: {
				modeId: ChatMode.Agent.id,
				unavailableCustomMode: undefined,
				storeSelection: false,
			},
			unavailableBuiltin: {
				modeId: ChatMode.Agent.id,
				unavailableCustomMode: undefined,
				storeSelection: true,
			},
			unavailableBuiltinWithoutAgent: {
				modeId: ChatMode.Ask.id,
				unavailableCustomMode: undefined,
				storeSelection: true,
			},
			disabledBuiltinAgent: {
				modeId: ChatMode.Ask.id,
				unavailableCustomMode: undefined,
				storeSelection: true,
			},
			persistedFallback: { id: customMode.id, kind: customMode.kind },
		});
	});
});
