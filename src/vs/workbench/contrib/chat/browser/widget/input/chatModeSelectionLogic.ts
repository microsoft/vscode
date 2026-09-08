/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatMode, type IChatMode } from '../../../common/chatModes.js';
import { ChatModeKind } from '../../../common/constants.js';
import type { IChatModelInputState } from '../../../common/model/chatModel.js';

/**
 * Resolves the visible mode without discarding a temporarily unavailable or disabled custom selection.
 */
export function resolveChatModeForView(mode: IChatModelInputState['mode'], resolvedMode: IChatMode | undefined, isAgentModeEnabled: boolean, isAgentModeAvailable: boolean): {
	readonly modeId: string;
	readonly unavailableCustomMode: IChatModelInputState['mode'] | undefined;
	readonly storeSelection: boolean;
} {
	const isCustomMode = resolvedMode
		? !resolvedMode.isBuiltin
		: mode.id !== ChatMode.Agent.id && mode.id !== ChatMode.Ask.id && mode.id !== ChatMode.Edit.id;
	if (resolvedMode && (resolvedMode.kind !== ChatModeKind.Agent || (isAgentModeEnabled && isAgentModeAvailable))) {
		return { modeId: resolvedMode.id, unavailableCustomMode: undefined, storeSelection: false };
	}
	if (isCustomMode) {
		return {
			modeId: isAgentModeEnabled && isAgentModeAvailable ? ChatMode.Agent.id : ChatMode.Ask.id,
			unavailableCustomMode: mode,
			storeSelection: false,
		};
	}
	return {
		modeId: isAgentModeEnabled && isAgentModeAvailable ? ChatMode.Agent.id : ChatMode.Ask.id,
		unavailableCustomMode: undefined,
		storeSelection: true,
	};
}

/** Overlays a dormant custom mode onto the state written to persistence. */
export function withPersistedUnavailableChatMode(state: IChatModelInputState, unavailableMode: IChatModelInputState['mode'] | undefined): IChatModelInputState {
	return unavailableMode ? { ...state, mode: unavailableMode } : state;
}
