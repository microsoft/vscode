/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from '../../../../../base/common/event.js';
import { ChatMode, IChatMode, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	readonly _serviceBrand: undefined;

	public readonly onDidChangeChatModes = Event.None;

	constructor(private readonly _modes: { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } = { builtin: [ChatMode.Ask], custom: [] }) { }

	getModes(): { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } {
		return this._modes;
	}

	findModeById(id: string): IChatMode | undefined {
		return this._modes.builtin.find(mode => mode.id === id) ?? this._modes.custom.find(mode => mode.id === id);
	}

	findModeByName(name: string): IChatMode | undefined {
		return this._modes.builtin.find(mode => mode.name.get() === name) ?? this._modes.custom.find(mode => mode.name.get() === name);
	}
}
