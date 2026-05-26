/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatMode, IChatMode, IChatModes, IChatModeService } from '../../common/chatModes.js';

export class MockChatModeService implements IChatModeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = new Emitter<void>();
	private readonly _modesView: IChatModes & IDisposable;

	constructor(
		private readonly _modes: { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } = { builtin: [ChatMode.Ask], custom: [] }
	) {
		const modes = this._modes;
		const onDidChange = this._onDidChange.event;
		this._modesView = {
			onDidChange,
			dispose() { },
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

	createModes(_sessionResource: URI): IChatModes & IDisposable {
		return this._modesView;
	}

	async getLocalModes(): Promise<IChatModes> {
		return this._modesView;
	}

	/** Test helper to fire the change event for the cached modes view. */
	fireDidChange(): void {
		this._onDidChange.fire();
	}
}
