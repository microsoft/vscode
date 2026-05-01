/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Event } from '../../../../../base/common/event.js';
import { ChatMode, IChatMode, IChatModes, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	public readonly onDidChangeChatModes = Event.None;

	private readonly _modesView: IChatModes;

	constructor(
		private readonly _modes: { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } = { builtin: [ChatMode.Ask], custom: [] }
	) {
		const modes = this._modes;
		this._modesView = {
			get builtin() { return modes.builtin; },
			get custom() { return modes.custom; },
			findModeById(id: string): IChatMode | undefined {
				return modes.builtin.find(mode => mode.id === id) ?? modes.custom.find(mode => mode.id === id);
			},
			findModeByName(name: string): IChatMode | undefined {
				return modes.builtin.find(mode => mode.name.get() === name) ?? modes.custom.find(mode => mode.name.get() === name);
			},
		};
	}

	getModes(): IChatModes {
		return this._modesView;
	}

}
