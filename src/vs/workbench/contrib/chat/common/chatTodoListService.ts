/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
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
	getCustomTitle(sessionId: string): string | undefined;
	setCustomTitle(sessionId: string, title: string | undefined): void;
}

export const IChatTodoListService = createDecorator<IChatTodoListService>('chatTodoListService');

export interface IChatTodoListService {
	readonly _serviceBrand: undefined;
	getTodos(sessionId: string): IChatTodo[];
	setTodos(sessionId: string, todos: IChatTodo[]): void;
	getCustomTitle(sessionId: string): string | undefined;
	setCustomTitle(sessionId: string, title: string | undefined): void;
	onDidChangeCustomTitle: Event<string>;
}

export class ChatTodoListStorage implements IChatTodoListStorage {
	private memento: Memento<Record<string, IChatTodo[]>>;
	private titleMemento: Memento<Record<string, string>>;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('chat-todo-list', storageService);
		this.titleMemento = new Memento('chat-todo-list-titles', storageService);
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

	getCustomTitle(sessionId: string): string | undefined {
		const storage = this.titleMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[sessionId];
	}

	setCustomTitle(sessionId: string, title: string | undefined): void {
		const storage = this.titleMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		if (title === undefined) {
			delete storage[sessionId];
		} else {
			storage[sessionId] = title;
		}
		this.titleMemento.saveMemento();
	}
}

export class ChatTodoListService extends Disposable implements IChatTodoListService {
	declare readonly _serviceBrand: undefined;

	private todoListStorage: IChatTodoListStorage;
	private readonly _onDidChangeCustomTitle = this._register(new Emitter<string>());
	public readonly onDidChangeCustomTitle = this._onDidChangeCustomTitle.event;

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

	getCustomTitle(sessionId: string): string | undefined {
		return this.todoListStorage.getCustomTitle(sessionId);
	}

	setCustomTitle(sessionId: string, title: string | undefined): void {
		this.todoListStorage.setCustomTitle(sessionId, title);
		this._onDidChangeCustomTitle.fire(sessionId);
	}
}
