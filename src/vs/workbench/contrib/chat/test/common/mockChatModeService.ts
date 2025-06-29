/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from '../../../../../base/common/event.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ChatMode2, IChatMode, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	readonly _serviceBrand: undefined;

	private _modes: { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] } = { builtin: [ChatMode2.Ask] };
	private readonly _modesObservable = observableValue<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }>('mockChatModes', this._modes);

	public readonly onDidChangeChatModes = Event.None;
	public readonly modesObservable: IObservable<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }> = this._modesObservable;

	getModes(): { builtin: readonly IChatMode[]; custom?: readonly IChatMode[] } {
		return this._modes;
	}

	async getModesAsync(): Promise<{ builtin: readonly IChatMode[]; custom?: readonly IChatMode[] }> {
		return this._modes;
	}
}
