/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';

export const IChatWidgetHistoryService = createDecorator<IChatWidgetHistoryService>('IChatWidgetHistoryService');
export interface IChatWidgetHistoryService {
	_serviceBrand: undefined;

	readonly onDidClearHistory: Event<void>;

	clearHistory(): void;
	getHistory(providerId: string): string[];
	saveHistory(providerId: string, history: string[]): void;
}

interface IChatHistory {
	history: { [providerId: string]: string[] };
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
		this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE) as IChatHistory;
	}

	getHistory(providerId: string): string[] {
		return this.viewState.history?.[providerId] ?? [];
	}

	saveHistory(providerId: string, history: string[]): void {
		if (!this.viewState.history) {
			this.viewState.history = {};
		}
		this.viewState.history[providerId] = history;
		this.memento.saveMemento();
	}

	clearHistory(): void {
		this.viewState.history = {};
		this.memento.saveMemento();
		this._onDidClearHistory.fire();
	}
}
