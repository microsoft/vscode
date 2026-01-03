/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { chatSessionResourceToId } from '../model/chatUri.js';

export interface IChatTodo {
	id: number;
	title: string;
	description?: string;
	status: 'not-started' | 'in-progress' | 'completed';
}

export interface IChatTodoListStorage {
	getTodoList(sessionResource: URI): IChatTodo[];
	setTodoList(sessionResource: URI, todoList: IChatTodo[]): void;
}

export const IChatTodoListService = createDecorator<IChatTodoListService>('chatTodoListService');

export interface IChatTodoListService {
	readonly _serviceBrand: undefined;
	readonly onDidUpdateTodos: Event<URI>;
	getTodos(sessionResource: URI): IChatTodo[];
	setTodos(sessionResource: URI, todos: IChatTodo[]): void;
}

export class ChatTodoListStorage implements IChatTodoListStorage {
	private memento: Memento<Record<string, IChatTodo[]>>;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('chat-todo-list', storageService);
	}

	private getSessionData(sessionResource: URI): IChatTodo[] {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[this.toKey(sessionResource)] || [];
	}

	private setSessionData(sessionResource: URI, todoList: IChatTodo[]): void {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[this.toKey(sessionResource)] = todoList;
		this.memento.saveMemento();
	}

	getTodoList(sessionResource: URI): IChatTodo[] {
		return this.getSessionData(sessionResource);
	}

	setTodoList(sessionResource: URI, todoList: IChatTodo[]): void {
		this.setSessionData(sessionResource, todoList);
	}

	private toKey(sessionResource: URI): string {
		return chatSessionResourceToId(sessionResource);
	}
}

export class ChatTodoListService extends Disposable implements IChatTodoListService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidUpdateTodos = this._register(new Emitter<URI>());
	readonly onDidUpdateTodos = this._onDidUpdateTodos.event;

	private todoListStorage: IChatTodoListStorage;

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this.todoListStorage = new ChatTodoListStorage(storageService);
	}

	getTodos(sessionResource: URI): IChatTodo[] {
		return this.todoListStorage.getTodoList(sessionResource);
	}

	setTodos(sessionResource: URI, todos: IChatTodo[]): void {
		this.todoListStorage.setTodoList(sessionResource, todos);
		this._onDidUpdateTodos.fire(sessionResource);
	}
}
