/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import { IChatModelInputState } from './chatModel.js';
import { CHAT_PROVIDER_ID } from './chatParticipantContribTypes.js';
import { IChatRequestVariableEntry } from './chatVariableEntries.js';
import { ChatAgentLocation, ChatModeKind } from './constants.js';

interface IChatHistoryEntry {
	text: string;
	state?: IChatInputState;
}

/** The collected input state for chat history entries */
interface IChatInputState {
	[key: string]: any;
	chatContextAttachments?: ReadonlyArray<IChatRequestVariableEntry>;

	/**
	 * This should be a mode id (ChatMode | string).
	 * { id: string } is the old IChatMode. This is deprecated but may still be in persisted data.
	 */
	chatMode?: ChatModeKind | string | { id: string };
}

export const IChatWidgetHistoryService = createDecorator<IChatWidgetHistoryService>('IChatWidgetHistoryService');
export interface IChatWidgetHistoryService {
	_serviceBrand: undefined;

	readonly onDidClearHistory: Event<void>;

	clearHistory(): void;
	getHistory(location: ChatAgentLocation): IChatModelInputState[];
	saveHistory(location: ChatAgentLocation, history: IChatModelInputState[]): void;
}

interface IChatHistory {
	history?: { [providerId: string]: IChatModelInputState[] };
}

export const ChatInputHistoryMaxEntries = 40;

export class ChatWidgetHistoryService implements IChatWidgetHistoryService {
	_serviceBrand: undefined;

	private memento: Memento<IChatHistory>;
	private viewState: IChatHistory;

	private readonly _onDidClearHistory = new Emitter<void>();
	readonly onDidClearHistory: Event<void> = this._onDidClearHistory.event;

	constructor(
		@IStorageService storageService: IStorageService
	) {
		this.memento = new Memento<IChatHistory>('interactive-session', storageService);
		const loadedState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		this.viewState = loadedState;
	}

	getHistory(location: ChatAgentLocation): IChatModelInputState[] {
		const key = this.getKey(location);
		const history = this.viewState.history?.[key] ?? [];

		// Migrate old IChatHistoryEntry format to IChatModelInputState
		return history.map(entry => this.migrateHistoryEntry(entry));
	}

	private migrateHistoryEntry(entry: any): IChatModelInputState {
		// If it's already in the new format (has 'inputText' property), return as-is
		if (entry.inputText !== undefined) {
			return entry as IChatModelInputState;
		}

		// Otherwise, it's an old IChatHistoryEntry with 'text' and 'state' properties
		const oldEntry = entry as IChatHistoryEntry;
		const oldState = oldEntry.state ?? {};

		// Migrate chatMode to the new mode structure
		let modeId: string;
		let modeKind: ChatModeKind | undefined;
		if (oldState.chatMode) {
			if (typeof oldState.chatMode === 'string') {
				modeId = oldState.chatMode;
				modeKind = Object.values(ChatModeKind).includes(oldState.chatMode as ChatModeKind)
					? oldState.chatMode as ChatModeKind
					: undefined;
			} else if (typeof oldState.chatMode === 'object' && oldState.chatMode !== null) {
				// Old format: { id: string }
				const oldMode = oldState.chatMode as { id?: string };
				modeId = oldMode.id ?? ChatModeKind.Ask;
				modeKind = oldMode.id && Object.values(ChatModeKind).includes(oldMode.id as ChatModeKind)
					? oldMode.id as ChatModeKind
					: undefined;
			} else {
				modeId = ChatModeKind.Ask;
				modeKind = ChatModeKind.Ask;
			}
		} else {
			modeId = ChatModeKind.Ask;
			modeKind = ChatModeKind.Ask;
		}

		return {
			inputText: oldEntry.text ?? '',
			attachments: oldState.chatContextAttachments ?? [],
			mode: {
				id: modeId,
				kind: modeKind
			},
			contrib: oldEntry.state || {},
			selectedModel: undefined,
			selections: []
		};
	}

	private getKey(location: ChatAgentLocation): string {
		// Preserve history for panel by continuing to use the same old provider id. Use the location as a key for other chat locations.
		return location === ChatAgentLocation.Chat ? CHAT_PROVIDER_ID : location;
	}

	saveHistory(location: ChatAgentLocation, history: IChatModelInputState[]): void {
		if (!this.viewState.history) {
			this.viewState.history = {};
		}

		const key = this.getKey(location);
		this.viewState.history[key] = history.slice(-ChatInputHistoryMaxEntries);
		this.memento.saveMemento();
	}

	clearHistory(): void {
		this.viewState.history = {};
		this.memento.saveMemento();
		this._onDidClearHistory.fire();
	}
}
