/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';

export interface IChatTask {
	id: number;
	title: string;
	description?: string;
	status: 'not-started' | 'in-progress' | 'completed';
}

export interface IChatTaskStorage {
	getTasks(sessionId: string): IChatTask[];
	setTasks(sessionId: string, tasks: IChatTask[]): void;
}

export const IChatTasksService = createDecorator<IChatTasksService>('chatTasksService');

export interface IChatTasksService {
	readonly _serviceBrand: undefined;
	getChatTasksStorage(): IChatTaskStorage;
}

export class ChatTaskstorage implements IChatTaskStorage {
	private memento: Memento;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('chat-tasks', storageService);
	}

	private getSessionData(sessionId: string): IChatTask[] {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[sessionId] || [];
	}

	private setSessionData(sessionId: string, tasks: IChatTask[]): void {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[sessionId] = tasks;
		this.memento.saveMemento();
	}

	getTasks(sessionId: string): IChatTask[] {
		return this.getSessionData(sessionId);
	}

	setTasks(sessionId: string, tasks: IChatTask[]): void {
		this.setSessionData(sessionId, tasks);
	}
}

export class ChatTaskServiceImpl extends Disposable implements IChatTasksService {
	declare readonly _serviceBrand: undefined;

	private tasksStorage: IChatTaskStorage;

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this.tasksStorage = new ChatTaskstorage(storageService);
	}

	getChatTasksStorage(): IChatTaskStorage {
		return this.tasksStorage;
	}
}
