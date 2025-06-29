/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from '../../../../../base/common/event.js';
import { ChatMode2, IChatMode2, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	readonly _serviceBrand: undefined;

	private _modes: { builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] } = { builtin: [ChatMode2.Ask], custom: [] };

	public readonly onDidChangeChatModes = Event.None;

	getModes(): { builtin: readonly IChatMode2[]; custom: readonly IChatMode2[] } {
		return this._modes;
	}

	findModeById(id: string): IChatMode2 | undefined {
		const allModes = this.getModes();
		const builtinMode = allModes.builtin.find(mode => mode.id === id);
		if (builtinMode) {
			return builtinMode;
		}
		return allModes.custom.find(mode => mode.id === id);
	}
}
