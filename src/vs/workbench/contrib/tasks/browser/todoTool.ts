/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';
import {
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	ToolDataSource,
	IToolInvocationPreparationContext,
	IPreparedToolInvocation
} from '../../chat/common/languageModelToolsService.js';
import { IChatTodoContent } from '../../chat/common/chatService.js';

// Todo status enum
export enum TodoStatus {
	NotStarted = 'not-started',
	InProgress = 'in-progress',
	Completed = 'completed'
}

// Todo interface
export interface ITodo {
	id: string;
	content: string;
	status: TodoStatus;
	order: number;
	createdAt: number;
	updatedAt: number;
}

// Todo storage interface
export interface ITodoStorage {
	getTodos(sessionId: string): ITodo[];
	setTodos(sessionId: string, todos: ITodo[]): void;
	addTodo(sessionId: string, todo: Omit<ITodo, 'id' | 'createdAt' | 'updatedAt' | 'order'>): ITodo;
	updateTodo(sessionId: string, todoId: string, updates: Partial<Pick<ITodo, 'content' | 'status'>>): ITodo | undefined;
	deleteTodo(sessionId: string, todoId: string): boolean;
	reorderTodos(sessionId: string, todoIds: string[]): void;
}

// Todo operation types
interface CreateTodoOperation {
	operation: 'create';
	content: string;
}

interface UpdateTodoOperation {
	operation: 'update';
	content: string;
}

interface ReadTodosOperation {
	operation: 'read';
}

type TodoOperation = CreateTodoOperation | UpdateTodoOperation | ReadTodosOperation;

// Service ID
export const ITodoToolService = createDecorator<ITodoToolService>('todoToolService');

export interface ITodoToolService {
	readonly _serviceBrand: undefined;
	getTodoStorage(): ITodoStorage;
}

// Todo storage implementation
export class TodoStorage implements ITodoStorage {
	private memento: Memento;

	constructor(@IStorageService storageService: IStorageService) {
		this.memento = new Memento('todo-tool', storageService);
	}

	private getSessionData(sessionId: string): { todos: ITodo[]; nextId: number } {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		return storage[sessionId] || { todos: [], nextId: 1 };
	}

	private setSessionData(sessionId: string, data: { todos: ITodo[]; nextId: number }): void {
		const storage = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage[sessionId] = data;
		this.memento.saveMemento();
	}

	getTodos(sessionId: string): ITodo[] {
		const data = this.getSessionData(sessionId);
		return data.todos.sort((a, b) => a.order - b.order);
	}

	setTodos(sessionId: string, todos: ITodo[]): void {
		const data = this.getSessionData(sessionId);
		data.todos = todos;
		this.setSessionData(sessionId, data);
	}

	addTodo(sessionId: string, todo: Omit<ITodo, 'id' | 'createdAt' | 'updatedAt' | 'order'>): ITodo {
		const data = this.getSessionData(sessionId);
		const now = Date.now();
		const maxOrder = data.todos.length > 0 ? Math.max(...data.todos.map(t => t.order)) : 0;

		const newTodo: ITodo = {
			...todo,
			id: `todo-${data.nextId}`,
			createdAt: now,
			updatedAt: now,
			order: maxOrder + 1
		};

		data.todos.push(newTodo);
		data.nextId++;
		this.setSessionData(sessionId, data);

		return newTodo;
	}

	updateTodo(sessionId: string, todoId: string, updates: Partial<Pick<ITodo, 'content' | 'status'>>): ITodo | undefined {
		const data = this.getSessionData(sessionId);
		const todoIndex = data.todos.findIndex(t => t.id === todoId);

		if (todoIndex === -1) {
			return undefined;
		}

		const todo = data.todos[todoIndex];
		const updatedTodo: ITodo = {
			...todo,
			...updates,
			updatedAt: Date.now()
		};

		data.todos[todoIndex] = updatedTodo;
		this.setSessionData(sessionId, data);

		return updatedTodo;
	}

	deleteTodo(sessionId: string, todoId: string): boolean {
		const data = this.getSessionData(sessionId);
		const todoIndex = data.todos.findIndex(t => t.id === todoId);

		if (todoIndex === -1) {
			return false;
		}

		data.todos.splice(todoIndex, 1);
		this.setSessionData(sessionId, data);

		return true;
	}

	reorderTodos(sessionId: string, todoIds: string[]): void {
		const data = this.getSessionData(sessionId);
		const todoMap = new Map(data.todos.map(t => [t.id, t]));

		// Reorder todos based on the provided order
		const reorderedTodos: ITodo[] = [];
		todoIds.forEach((id, index) => {
			const todo = todoMap.get(id);
			if (todo) {
				reorderedTodos.push({ ...todo, order: index + 1 });
				todoMap.delete(id);
			}
		});

		// Add any remaining todos that weren't in the reorder list
		todoMap.forEach(todo => {
			reorderedTodos.push({ ...todo, order: reorderedTodos.length + 1 });
		});

		data.todos = reorderedTodos;
		this.setSessionData(sessionId, data);
	}
}

// Todo tool service implementation
export class TodoToolService extends Disposable implements ITodoToolService {
	declare readonly _serviceBrand: undefined;

	private todoStorage: ITodoStorage;

	constructor(@IStorageService storageService: IStorageService) {
		super();
		this.todoStorage = new TodoStorage(storageService);
	}

	getTodoStorage(): ITodoStorage {
		return this.todoStorage;
	}
}

// Tool data definition
export const TodoToolData: IToolData = {
	id: 'vscode_todo_internal',
	toolReferenceName: 'todo',
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.checklist.id),
	displayName: 'Todo List',
	modelDescription: 'A tool for managing markdown todo lists. Can create, update, and read todos using markdown task list format. Use -[x] for completed tasks, -[~] for in-progress tasks, and -[ ] for not started tasks. Create operation adds new todos from markdown. Update operation changes status of existing todos by matching content. Todos are stored per chat session.',
	userDescription: 'Manage markdown todo lists with status tracking and markdown task list formatting',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			operation: {
				type: 'string',
				enum: ['create', 'update', 'read'],
				description: 'The operation to perform on todos'
			},
			content: {
				type: 'string',
				description: 'Markdown task list content. Format: "- [x] Completed task\\n- [~] In progress task\\n- [ ] Not started task". Use -[x] for completion, -[~] for in progress, -[ ] for not started. For create: list new tasks. For update: list tasks with their current status.'
			}
		},
		required: ['operation']
	}
};

// Todo tool implementation
export class TodoTool implements IToolImpl {

	constructor(
		@ITodoToolService private readonly todoToolService: ITodoToolService
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: any, _progress: any, _token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as TodoOperation;
		const sessionId = invocation.context?.sessionId;

		if (!sessionId) {
			return {
				content: [{
					kind: 'text',
					value: 'Error: No session ID available for todo management.'
				}],
				toolResultDetails: {
					input: JSON.stringify(params),
					output: [{ isText: true, value: 'Error: Missing session ID' }]
				}
			};
		}

		try {
			const storage = this.todoToolService.getTodoStorage();

			switch (params.operation) {
				case 'create': {
					const createResult = this.handleCreateTodo(storage, sessionId, params);
					return {
						content: [{
							kind: 'text',
							value: createResult
						}],
						toolResultDetails: {
							input: JSON.stringify(params),
							output: [{ isText: true, value: createResult }]
						}
					};
				}
				case 'update': {
					const updateResult = this.handleUpdateTodo(storage, sessionId, params);
					return {
						content: [{
							kind: 'text',
							value: updateResult
						}],
						toolResultDetails: {
							input: JSON.stringify(params),
							output: [{ isText: true, value: updateResult }]
						}
					};
				}
				case 'read': {
					const readResult = this.handleReadTodos(storage, sessionId);
					return {
						content: [{
							kind: 'text',
							value: readResult
						}],
						toolResultDetails: {
							input: JSON.stringify(params),
							output: [{ isText: true, value: readResult }]
						}
					};
				}
				default: {
					const errorResult = 'Error: Unknown operation';
					return {
						content: [{
							kind: 'text',
							value: errorResult
						}],
						toolResultDetails: {
							input: JSON.stringify(params),
							output: [{ isText: true, value: errorResult }]
						}
					};
				}
			}

		} catch (error) {
			const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			return {
				content: [{
					kind: 'text',
					value: errorMessage
				}],
				toolResultDetails: {
					input: JSON.stringify(params),
					output: [{ isText: true, value: errorMessage }]
				}
			};
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const params = context.parameters as TodoOperation;

		let message: string;
		let toolSpecificData: IChatTodoContent | undefined;

		// Get current todos for all operations to provide consistent UI rendering
		if (context.chatSessionId) {
			const storage = this.todoToolService.getTodoStorage();
			const todos = storage.getTodos(context.chatSessionId);

			switch (params.operation) {
				case 'create': {
					if (params.content) {
						const parsedTodos = this.parseMarkdownTaskList(params.content);
						if (parsedTodos.length > 0) {
							message = `Creating ${parsedTodos.length} todo(s) from markdown task list`;
							// Show current todos plus preview of the new todos being created
							const previewTodos = [
								...todos,
								...parsedTodos.map((todo, index) => ({
									id: `preview-new-${index}`,
									content: todo.content,
									status: todo.status
								}))
							];
							toolSpecificData = {
								kind: 'todo',
								todoData: {
									title: `Todo List (Creating ${parsedTodos.length} new todo(s))`,
									todos: previewTodos.map(todo => ({
										id: todo.id,
										content: todo.content,
										status: todo.status
									}))
								}
							};
						} else {
							message = `Creating todo: "${params.content}"`;
							// Fallback for plain text content
							const previewTodos = [...todos, {
								id: 'preview-new',
								content: params.content || 'New todo',
								status: TodoStatus.NotStarted
							}];
							toolSpecificData = {
								kind: 'todo',
								todoData: {
									title: 'Todo List (Creating new todo)',
									todos: previewTodos.map(todo => ({
										id: todo.id,
										content: todo.content,
										status: todo.status
									}))
								}
							};
						}
					} else {
						message = 'Creating new todo';
						toolSpecificData = {
							kind: 'todo',
							todoData: {
								title: 'Todo List (Creating new todo)',
								todos: todos.map(todo => ({
									id: todo.id,
									content: todo.content,
									status: todo.status
								}))
							}
						};
					}
					break;
				}
				case 'update': {
					message = 'Updating todos from markdown task list';
					// Show todos with the updates applied for preview
					if (params.content) {
						const parsedTodos = this.parseMarkdownTaskList(params.content);
						const todoMap = new Map(todos.map(t => [t.content, t]));
						const updatedTodos = [...todos];

						// Update existing todos based on content match
						for (const parsedTodo of parsedTodos) {
							const existingTodo = todoMap.get(parsedTodo.content);
							if (existingTodo) {
								const todoIndex = updatedTodos.findIndex(t => t.id === existingTodo.id);
								if (todoIndex !== -1) {
									updatedTodos[todoIndex] = {
										...updatedTodos[todoIndex],
										status: parsedTodo.status
									};
								}
							}
						}

						toolSpecificData = {
							kind: 'todo',
							todoData: {
								title: 'Todo List (Updating todos)',
								todos: updatedTodos.map(todo => ({
									id: todo.id,
									content: todo.content,
									status: todo.status
								}))
							}
						};
					} else {
						toolSpecificData = {
							kind: 'todo',
							todoData: {
								title: 'Todo List (Updating todos)',
								todos: todos.map(todo => ({
									id: todo.id,
									content: todo.content,
									status: todo.status
								}))
							}
						};
					}
					break;
				}
				case 'read': {
					message = 'Reading all todos';
					toolSpecificData = {
						kind: 'todo',
						todoData: {
							title: 'Todo List',
							todos: todos.map(todo => ({
								id: todo.id,
								content: todo.content,
								status: todo.status
							}))
						}
					};
					break;
				}
				default: {
					message = 'Managing todos';
					toolSpecificData = {
						kind: 'todo',
						todoData: {
							title: 'Todo List',
							todos: todos.map(todo => ({
								id: todo.id,
								content: todo.content,
								status: todo.status
							}))
						}
					};
				}
			}
		} else {
			// Fallback when no session ID is available
			switch (params.operation) {
				case 'create':
					message = `Creating todo: "${params.content}"`;
					break;
				case 'update':
					message = 'Updating todos from markdown task list';
					break;
				case 'read':
					message = 'Reading all todos';
					break;
				default:
					message = 'Managing todos';
			}
		}

		return {
			invocationMessage: new MarkdownString(message),
			pastTenseMessage: new MarkdownString('Todo operation completed'),
			toolSpecificData
		};
	}

	private handleCreateTodo(storage: ITodoStorage, sessionId: string, params: CreateTodoOperation): string {
		if (!params.content?.trim()) {
			throw new Error('Markdown task list content is required');
		}

		const parsedTodos = this.parseMarkdownTaskList(params.content.trim());
		if (parsedTodos.length === 0) {
			throw new Error('No valid markdown tasks found. Use format: "- [ ] Task 1\\n- [x] Task 2"');
		}

		const createdTodos: ITodo[] = [];
		for (const parsedTodo of parsedTodos) {
			const todo = storage.addTodo(sessionId, {
				content: parsedTodo.content,
				status: parsedTodo.status
			});
			createdTodos.push(todo);
		}

		return this.formatTodosAsMarkdown(createdTodos, `${createdTodos.length} Todo(s) Created`);
	}

	private handleUpdateTodo(storage: ITodoStorage, sessionId: string, params: UpdateTodoOperation): string {
		if (!params.content?.trim()) {
			throw new Error('Markdown task list content is required for update operation');
		}

		const parsedTodos = this.parseMarkdownTaskList(params.content.trim());
		if (parsedTodos.length === 0) {
			throw new Error('No valid markdown tasks found. Use format: "- [ ] Task 1\\n- [x] Task 2"');
		}

		const existingTodos = storage.getTodos(sessionId);
		const updatedTodos: ITodo[] = [];

		// Update existing todos based on content match
		for (const parsedTodo of parsedTodos) {
			const existingTodo = existingTodos.find(t => t.content === parsedTodo.content);
			if (existingTodo) {
				const updatedTodo = storage.updateTodo(sessionId, existingTodo.id, {
					status: parsedTodo.status
				});
				if (updatedTodo) {
					updatedTodos.push(updatedTodo);
				}
			}
		}

		if (updatedTodos.length === 0) {
			throw new Error('No matching todos found to update. Make sure the task content matches existing todos.');
		}

		return this.formatTodosAsMarkdown(updatedTodos, `${updatedTodos.length} Todo(s) Updated`);
	}

	private handleReadTodos(storage: ITodoStorage, sessionId: string): string {
		const todos = storage.getTodos(sessionId);

		if (todos.length === 0) {
			return '# Todo List\n\nNo todos found.';
		}

		// Include both markdown task list format and detailed format
		const markdownTaskList = this.formatTodosAsMarkdownTaskList(todos);
		const detailedFormat = this.formatTodosAsMarkdown(todos, 'Todo List Details');

		return `# Todo List\n\n## Markdown Task List\n\n${markdownTaskList}\n\n${detailedFormat}`;
	}

	private formatTodosAsMarkdown(todos: ITodo[], title: string): string {
		if (todos.length === 0) {
			return `# ${title}\n\nNo todos found.`;
		}

		const lines = [`# ${title}\n`];

		for (const todo of todos) {
			const statusText = this.getStatusText(todo.status);

			lines.push(`## ${todo.content}`);
			lines.push(`- **Status:** ${statusText}`);
			lines.push(`- **ID:** \`${todo.id}\``);
			lines.push('');
		}

		return lines.join('\n');
	}

	private getStatusText(status: TodoStatus): string {
		switch (status) {
			case TodoStatus.NotStarted:
				return 'Not Started';
			case TodoStatus.InProgress:
				return 'In Progress';
			case TodoStatus.Completed:
				return 'Completed';
			default:
				return 'Not Started';
		}
	}

	private parseMarkdownTaskList(markdownContent: string): Array<{ content: string; status: TodoStatus }> {
		const lines = markdownContent.split('\n');
		const todos: Array<{ content: string; status: TodoStatus }> = [];

		for (const line of lines) {
			const trimmedLine = line.trim();

			// Match markdown task list items: - [ ], - [x], - [X], or - [~]
			const taskMatch = trimmedLine.match(/^-\s*\[([x\sX~])\]\s*(.+)$/);
			if (taskMatch) {
				const statusChar = taskMatch[1].toLowerCase();
				const content = taskMatch[2].trim();

				if (content) {
					let status: TodoStatus;
					if (statusChar === 'x') {
						status = TodoStatus.Completed;
					} else if (statusChar === '~') {
						status = TodoStatus.InProgress;
					} else {
						status = TodoStatus.NotStarted;
					}

					todos.push({
						content,
						status
					});
				}
			}
		}

		return todos;
	}

	private formatTodosAsMarkdownTaskList(todos: ITodo[]): string {
		if (todos.length === 0) {
			return '';
		}

		return todos.map(todo => {
			let checkbox: string;
			switch (todo.status) {
				case TodoStatus.Completed:
					checkbox = '[x]';
					break;
				case TodoStatus.InProgress:
					checkbox = '[~]';
					break;
				case TodoStatus.NotStarted:
				default:
					checkbox = '[ ]';
					break;
			}
			return `- ${checkbox} ${todo.content}`;
		}).join('\n');
	}
}
