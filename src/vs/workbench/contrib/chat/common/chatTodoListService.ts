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

export interface IChatTodoListStorage {
	getTodoList(sessionId: string): IChatTodo[];
	setTodoList(sessionId: string, todoList: IChatTodo[]): void;
}

export const IChatTodoListService = createDecorator<IChatTodoListService>('chatTodoListService');

export interface IChatTodoListService {
	readonly _serviceBrand: undefined;
	getTodos(sessionId: string): IChatTodo[];
	setTodos(sessionId: string, todos: IChatTodo[]): void;
}

export class ChatTodoListStorage implements IChatTodoListStorage {
	private memento: Memento;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('chat-todo-list', storageService);
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
}
