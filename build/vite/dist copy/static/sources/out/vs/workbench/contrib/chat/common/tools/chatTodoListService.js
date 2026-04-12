/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { chatSessionResourceToId } from '../model/chatUri.js';
export const IChatTodoListService = createDecorator('chatTodoListService');
let ChatTodoListStorage = class ChatTodoListStorage {
    constructor(storageService) {
        this.memento = new Memento('chat-todo-list', storageService);
    }
    getSessionData(sessionResource) {
        const storage = this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        return storage[this.toKey(sessionResource)] || [];
    }
    setSessionData(sessionResource, todoList) {
        const storage = this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
        storage[this.toKey(sessionResource)] = todoList;
        this.memento.saveMemento();
    }
    getTodoList(sessionResource) {
        return this.getSessionData(sessionResource);
    }
    setTodoList(sessionResource, todoList) {
        this.setSessionData(sessionResource, todoList);
    }
    migrateTodoList(oldSessionResource, newSessionResource) {
        const todos = this.getSessionData(oldSessionResource);
        if (todos.length > 0) {
            this.setSessionData(newSessionResource, todos);
            // Clear old session data
            const storage = this.memento.getMemento(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
            delete storage[this.toKey(oldSessionResource)];
            this.memento.saveMemento();
        }
    }
    toKey(sessionResource) {
        return chatSessionResourceToId(sessionResource);
    }
};
ChatTodoListStorage = __decorate([
    __param(0, IStorageService)
], ChatTodoListStorage);
export { ChatTodoListStorage };
let ChatTodoListService = class ChatTodoListService extends Disposable {
    constructor(storageService) {
        super();
        this._onDidUpdateTodos = this._register(new Emitter());
        this.onDidUpdateTodos = this._onDidUpdateTodos.event;
        this.todoListStorage = new ChatTodoListStorage(storageService);
    }
    getTodos(sessionResource) {
        return this.todoListStorage.getTodoList(sessionResource);
    }
    setTodos(sessionResource, todos) {
        this.todoListStorage.setTodoList(sessionResource, todos);
        this._onDidUpdateTodos.fire(sessionResource);
    }
    migrateTodos(oldSessionResource, newSessionResource) {
        this.todoListStorage.migrateTodoList(oldSessionResource, newSessionResource);
        this._onDidUpdateTodos.fire(newSessionResource);
    }
};
ChatTodoListService = __decorate([
    __param(0, IStorageService)
], ChatTodoListService);
export { ChatTodoListService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFRvZG9MaXN0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxtREFBbUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFjOUQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsZUFBZSxDQUF1QixxQkFBcUIsQ0FBQyxDQUFDO0FBVTFGLElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW1CO0lBRy9CLFlBQTZCLGNBQStCO1FBQzNELElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsY0FBYyxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVPLGNBQWMsQ0FBQyxlQUFvQjtRQUMxQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsK0RBQStDLENBQUM7UUFDdkYsT0FBTyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxlQUFlLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNuRCxDQUFDO0lBRU8sY0FBYyxDQUFDLGVBQW9CLEVBQUUsUUFBcUI7UUFDakUsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFD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