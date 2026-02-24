/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatService } from '../common/chatService/chatService.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatRequestSlashCommandPart } from '../common/requestParser/chatParserTypes.js';

export class CreateSlashCommandsUsageTracker extends Disposable {
	private static readonly _USED_CREATE_SLASH_COMMANDS_KEY = 'chat.tips.usedCreateSlashCommands';

	constructor(
		private readonly _chatService: IChatService,
		private readonly _storageService: IStorageService,
		private readonly _getActiveContextKeyService: () => IContextKeyService | undefined,
	) {
		super();

		this._register(this._chatService.onDidSubmitRequest(e => {
			const model = this._chatService.getSession(e.chatSessionResource);
			const lastRequest = model?.lastRequest;
			if (!lastRequest) {
				return;
			}

			for (const part of lastRequest.message.parts) {
				if (part.kind === ChatRequestSlashCommandPart.Kind) {
					const slash = part as ChatRequestSlashCommandPart;
					if (CreateSlashCommandsUsageTracker._isCreateSlashCommand(slash.slashCommand.command)) {
						this._markUsed();
						return;
					}
				}
			}

			// Fallback when parsing doesn't produce a slash command part.
			const trimmed = lastRequest.message.text.trimStart();
			const match = /^\/(create-(?:instruction|prompt|agent|skill))(?:\s|$)/.exec(trimmed);
			if (match && CreateSlashCommandsUsageTracker._isCreateSlashCommand(match[1])) {
				this._markUsed();
			}
		}));
	}

	syncContextKey(contextKeyService: IContextKeyService): void {
		const used = this._storageService.getBoolean(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, StorageScope.APPLICATION, false);
		ChatContextKeys.hasUsedCreateSlashCommands.bindTo(contextKeyService).set(used);
	}

	private _markUsed(): void {
		if (this._storageService.getBoolean(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		this._storageService.store(CreateSlashCommandsUsageTracker._USED_CREATE_SLASH_COMMANDS_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const contextKeyService = this._getActiveContextKeyService();
		if (contextKeyService) {
			ChatContextKeys.hasUsedCreateSlashCommands.bindTo(contextKeyService).set(true);
		}
	}

	private static _isCreateSlashCommand(command: string): boolean {
		switch (command) {
			case 'create-instruction':
			case 'create-prompt':
			case 'create-agent':
			case 'create-skill':
				return true;
			default:
				return false;
		}
	}
}
