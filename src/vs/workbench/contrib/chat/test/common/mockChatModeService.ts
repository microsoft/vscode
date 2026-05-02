/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Emitter } from '../../../../../base/common/event.js';
import { ChatMode, IChatMode, IChatModes, IChatModeService } from '../../common/chatModes.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';

export class MockChatModeService implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = new Emitter<void>();
	private readonly _modesView: IChatModes;

	constructor(
		private readonly _modes: { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } = { builtin: [ChatMode.Ask], custom: [] }
	) {
		const modes = this._modes;
		const onDidChange = this._onDidChange.event;
		this._modesView = {
			sessionType: localChatSessionType,
			onDidChange,
			get builtin() { return modes.builtin; },
			get custom() { return modes.custom; },
			findModeById(id: string): IChatMode | undefined {
				return modes.builtin.find(mode => mode.id === id) ?? modes.custom.find(mode => mode.id === id);
			},
			findModeByName(name: string): IChatMode | undefined {
				return modes.builtin.find(mode => mode.name.get() === name) ?? modes.custom.find(mode => mode.name.get() === name);
			},
			waitForRefresh(): Promise<void> {
				return Promise.resolve();
			},
		};
	}

	getModes(_sessionType: string): IChatModes {
		return this._modesView;
	}

	async awaitModes(_sessionType: string): Promise<IChatModes> {
		return this._modesView;
	}

	/** Test helper to fire the change event for the cached modes view. */
	fireDidChange(): void {
		this._onDidChange.fire();
	}
}
