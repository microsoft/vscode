/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { Emitter, Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatMode, CustomChatMode, IChatMode, IChatModeService } from '../../common/chatModes.js';
import { ICustomChatMode } from '../../common/promptSyntax/service/promptsService.js';

export class MockChatModeService implements IChatModeService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeChatModes = new Emitter<void>();
	public readonly onDidChangeChatModes = this._onDidChangeChatModes.event;

	private _customModes: IChatMode[] = [];

	getModes(): { builtin: readonly IChatMode[]; custom: readonly IChatMode[] } {
		return { 
			builtin: [ChatMode.Ask, ChatMode.Edit, ChatMode.Agent], 
			custom: this._customModes 
		};
	}

	findModeById(id: string): IChatMode | undefined {
		const modes = this.getModes();
		return modes.builtin.find(mode => mode.id === id) ?? modes.custom.find(mode => mode.id === id);
	}

	findModeByName(name: string): IChatMode | undefined {
		const modes = this.getModes();
		return modes.builtin.find(mode => mode.name === name) ?? modes.custom.find(mode => mode.name === name);
	}

	addCustomMode(customChatMode: ICustomChatMode): void {
		const customMode = new CustomChatMode(customChatMode);
		this._customModes.push(customMode);
		this._onDidChangeChatModes.fire();
	}

	removeCustomMode(uri: URI): void {
		const index = this._customModes.findIndex(mode => mode.id === uri.toString());
		if (index >= 0) {
			this._customModes.splice(index, 1);
			this._onDidChangeChatModes.fire();
		}
	}
}
