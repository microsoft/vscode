/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from '../../../../../base/common/event.js';
import { ChatMode2, IChatMode, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	readonly _serviceBrand: undefined;

	private _modes: { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] } = { builtin: [ChatMode2.Ask] };

	public readonly onDidChangeChatModes = Event.None;

	getModes(): { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] } {
		return this._modes;
	}

	async getModesAsync(): Promise<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }> {
		return this._modes;
	}
}
