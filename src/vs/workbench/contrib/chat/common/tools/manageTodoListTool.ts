/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import {
	IToolData,
	IToolImpl,
	IToolInvocation,
	IToolResult,
	ToolDataSource,
	IToolInvocationPreparationContext,
	IPreparedToolInvocation
} from '../languageModelToolsService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatTodo, IChatTodoListService, IChatTodoListStorage } from '../chatTodoListService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';

export const TodoListToolSettingId = 'chat.todoListTool.enabled';

export const ManageTodoListToolToolId = 'vscode_manageTodoList';

export const ManageTodoListToolData: IToolData = {
	id: ManageTodoListToolToolId,
	toolReferenceName: 'manageTodoList',
	when: ContextKeyExpr.equals(`config.${TodoListToolSettingId}`, true),
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.checklist.id),
	displayName: 'Manage Todo Lists',
	modelDescription: 'A tool for managing todo lists. Can create/update and read items in a todo list. Operations: write (add new todo items or update todo items), read(retrieve all todo items).',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			operation: {
				type: 'string',
				enum: ['write', 'read'],
				description: 'The operation to perform on todo list: write or read. When using write, you must provide the complete todo list, including any new or updated items. Partial updates are not supported.'
			},
			todoList: {
				type: 'array',
				description: 'Array of todo items to be written.  Ignore for read operation ',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'number',
							description: 'Numerical identifier representing the position of the todo item in the ordered list. Lower numbers have higher priority.'
						},
						title: {
							type: 'string',
							description: 'Short title or summary of the todo item.'
						},
						description: {
							type: 'string',
							description: 'Detailed description of the todo item.'
						},
						status: {
							type: 'string',
							enum: ['not-started', 'in-progress', 'completed'],
							description: 'Current status of the todo item.'
						},
					},
					required: ['id', 'title', 'description', 'status']
				}
			}
		},
		required: ['operation']
	}
};

interface IManageTodoListToolInputParams {

	operation: 'write' | 'read';
	todoList: Array<{
		id: number;
		title: string;
		description: string;
		status: 'not-started' | 'in-progress' | 'completed';
	}>;
}

export class ManageTodoListTool extends Disposable implements IToolImpl {

	constructor(
		@IChatTodoListService private readonly chatTodoListService: IChatTodoListService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async invoke(invocation: IToolInvocation, _countTokens: any, _progress: any, _token: CancellationToken): Promise<IToolResult> {
		const chatSessionId = invocation.context?.sessionId;
		if (chatSessionId === undefined) {
			throw new Error('A chat session ID is required for this tool');
		}

		const args = invocation.parameters as IManageTodoListToolInputParams;
		this.logService.debug(`ManageTodoListTool: Invoking with options ${JSON.stringify(args)}`);

		try {
			const storage = this.chatTodoListService.getChatTodoListStorage();

			switch (args.operation) {
				case 'read': {
					const readResult = this.handleRead(storage, chatSessionId);
					return {
						content: [{
							kind: 'text',
							value: readResult
						}]
					};
				}
				case 'write': {
					const todoList: IChatTodo[] = args.todoList.map((parsedTodo) => ({
						id: parsedTodo.id,
						title: parsedTodo.title,
						description: parsedTodo.description,
						status: parsedTodo.status
					}));
					storage.setTodoList(chatSessionId, todoList);
					return {
						content: [{
							kind: 'text',
							value: 'Successfully wrote todo list'
						}]
					};
				}
				default: {
					const errorResult = 'Error: Unknown operation';
					return {
						content: [{
							kind: 'text',
							value: errorResult
						}]
					};
				}
			}

		} catch (error) {
			const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			return {
				content: [{
					kind: 'text',
					value: errorMessage
				}]
			};
		}
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {

		if (!context.chatSessionId) {
			throw new Error('chatSessionId undefined');
		}

		const storage = this.chatTodoListService.getChatTodoListStorage();
		const currentTodoItems = storage.getTodoList(context.chatSessionId);

		const args = context.parameters as IManageTodoListToolInputParams;
		let message: string | undefined;
		switch (args.operation) {
			case 'write': {
				if (args.todoList) {
					if (!currentTodoItems.length) {
						message = 'Creating todo list';
					}
					else {
						message = 'Updating todo list';
					}
				}
				break;
			}
			case 'read': {
				message = 'Reading all items in todo list';
				break;
			}
			default:
				break;
		}

		const items = args.todoList ?? currentTodoItems;
		const todoList = items.map(todo => ({
			id: todo.id.toString(),
			title: todo.title,
			description: todo.description,
			status: todo.status
		}));

		return {
			invocationMessage: new MarkdownString(message ?? 'Unknown todo list operation'),
			toolSpecificData: {
				kind: 'todoList',
				sessionId: context.chatSessionId,
				todoList: todoList
			}
		};
	}

	private handleRead(storage: IChatTodoListStorage, sessionId: string): string {
		const todoItems = storage.getTodoList(sessionId);

		if (todoItems.length === 0) {
			return 'No todo list found.';
		}

		const markdownTaskList = this.formatTodoListAsMarkdownTaskList(todoItems);

		return `# Task List\n\n${markdownTaskList}`;
	}

	private formatTodoListAsMarkdownTaskList(todoList: IChatTodo[]): string {
		if (todoList.length === 0) {
			return '';
		}

		return todoList.map(todo => {
			let checkbox: string;
			switch (todo.status) {
				case 'completed':
					checkbox = '[x]';
					break;
				case 'in-progress':
					checkbox = '[-]';
					break;
				case 'not-started':
				default:
					checkbox = '[ ]';
					break;
			}

			const lines = [`- ${checkbox} ${todo.title}`];
			if (todo.description && todo.description.trim()) {
				lines.push(`  - ${todo.description.trim()}`);
			}

			return lines.join('\n');
		}).join('\n');
	}
}
