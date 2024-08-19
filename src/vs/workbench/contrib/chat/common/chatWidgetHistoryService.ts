/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { ChatAgentLocation } from 'vs/workbench/contrib/chat/common/chatAgents';
import { CHAT_PROVIDER_ID } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';

export interface IChatHistoryEntry {
	text: string;
	state?: any;
}

export const IChatWidgetHistoryService = createDecorator<IChatWidgetHistoryService>('IChatWidgetHistoryService');
export interface IChatWidgetHistoryService {
	_serviceBrand: undefined;

	readonly onDidClearHistory: Event<void>;

	clearHistory(): void;
	getHistory(location: ChatAgentLocation): IChatHistoryEntry[];
	saveHistory(location: ChatAgentLocation, history: IChatHistoryEntry[]): void;
}

interface IChatHistory {
	history: { [providerId: string]: IChatHistoryEntry[] };
}

export class ChatWidgetHistoryService implements IChatWidgetHistoryService {
	_serviceBrand: undefined;

	private memento: Memento;
	private viewState: IChatHistory;

	private readonly _onDidClearHistory = new Emitter<void>();
	readonly onDidClearHistory: Event<void> = this._onDidClearHistory.event;

	constructor(
		@IStorageService storageService: IStorageService
	) {
		this.memento = new Memento('interactive-session', storageService);
		const loadedState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IChatHistory;
		for (const provider in loadedState.history) {
			// Migration from old format
			loadedState.history[provider] = loadedState.history[provider].map(entry => typeof entry === 'string' ? { text: entry } : entry);
		}

		this.viewState = loadedState;
	}

	getHistory(location: ChatAgentLocation): IChatHistoryEntry[] {
		const key = this.getKey(location);
		return this.viewState.history?.[key] ?? [];
	}

	private getKey(location: ChatAgentLocation): string {
		// Preserve history for panel by continuing to use the same old provider id. Use the location as a key for other chat locations.
		return location === ChatAgentLocation.Panel ? CHAT_PROVIDER_ID : location;
	}

	saveHistory(location: ChatAgentLocation, history: IChatHistoryEntry[]): void {
		if (!this.viewState.history) {
			this.viewState.history = {};
		}

		const key = this.getKey(location);
		this.viewState.history[key] = history;
		this.memento.saveMemento();
	}

	clearHistory(): void {
		this.viewState.history = {};
		this.memento.saveMemento();
		this._onDidClearHistory.fire();
	}
}
