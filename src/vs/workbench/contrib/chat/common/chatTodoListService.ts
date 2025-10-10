/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';

export interface IChatTodo {
	id: number;
	title: string;
	description?: string;
	status: 'not-started' | 'in-progress' | 'completed';
}

export interface IChatTodoListMetadata {
	customTitle?: string;
	titleHistory?: string[];
}

export interface IChatTodoListStorage {
	getTodoList(sessionId: string): IChatTodo[];
	setTodoList(sessionId: string, todoList: IChatTodo[]): void;
	getMetadata(sessionId: string): IChatTodoListMetadata;
	setMetadata(sessionId: string, metadata: IChatTodoListMetadata): void;
}

export const IChatTodoListService = createDecorator<IChatTodoListService>('chatTodoListService');

export interface IChatTodoListService {
	readonly _serviceBrand: undefined;
	getTodos(sessionId: string): IChatTodo[];
	setTodos(sessionId: string, todos: IChatTodo[]): void;
	getMetadata(sessionId: string): IChatTodoListMetadata;
	setMetadata(sessionId: string, metadata: IChatTodoListMetadata): void;
	addTitleToHistory(sessionId: string, title: string): void;
}

export class ChatTodoListStorage implements IChatTodoListStorage {
	private memento: Memento<Record<string, IChatTodo[]>>;
	private metadataMemento: Memento<Record<string, IChatTodoListMetadata>>;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('chat-todo-list', storageService);
		this.metadataMemento = new Memento('chat-todo-list-metadata', storageService);
	}

	private getSessionData(sessionId: string): IChatTodo[] {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[sessionId] || [];
	}

	private setSessionData(sessionId: string, todoList: IChatTodo[]): void {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[sessionId] = todoList;
		this.memento.saveMemento();
	}

	getTodoList(sessionId: string): IChatTodo[] {
		return this.getSessionData(sessionId);
	}

	setTodoList(sessionId: string, todoList: IChatTodo[]): void {
		this.setSessionData(sessionId, todoList);
	}

	getMetadata(sessionId: string): IChatTodoListMetadata {
		const storage = this.metadataMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[sessionId] || {};
	}

	setMetadata(sessionId: string, metadata: IChatTodoListMetadata): void {
		const storage = this.metadataMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[sessionId] = metadata;
		this.metadataMemento.saveMemento();
	}
}

export class ChatTodoListService extends Disposable implements IChatTodoListService {
	declare readonly _serviceBrand: undefined;

	private todoListStorage: IChatTodoListStorage;

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this.todoListStorage = new ChatTodoListStorage(storageService);
	}

	getTodos(sessionId: string): IChatTodo[] {
		return this.todoListStorage.getTodoList(sessionId);
	}

	setTodos(sessionId: string, todos: IChatTodo[]): void {
		this.todoListStorage.setTodoList(sessionId, todos);
	}

	getMetadata(sessionId: string): IChatTodoListMetadata {
		return this.todoListStorage.getMetadata(sessionId);
	}

	setMetadata(sessionId: string, metadata: IChatTodoListMetadata): void {
		this.todoListStorage.setMetadata(sessionId, metadata);
	}

	addTitleToHistory(sessionId: string, title: string): void {
		const metadata = this.getMetadata(sessionId);
		const history = metadata.titleHistory || [];
		
		// Add to history if not already present
		if (!history.includes(title)) {
			history.unshift(title);
			// Keep only last 10 titles
			if (history.length > 10) {
				history.pop();
			}
			metadata.titleHistory = history;
			this.setMetadata(sessionId, metadata);
		}
	}
}
