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

export const ManageTodoListToolToolId = 'manage_todo_list';

export const ManageTodoListToolData: IToolData = {
	id: ManageTodoListToolToolId,
	toolReferenceName: 'todos',
	when: ContextKeyExpr.equals(`config.${TodoListToolSettingId}`, true),
	canBeReferencedInPrompt: true,
	icon: ThemeIcon.fromId(Codicon.checklist.id),
	displayName: 'Update Todo List',
	userDescription: 'Manage and track todo items for task planning',
	modelDescription: 'Manage a structured todo list to track progress and plan tasks throughout your coding session. Use this tool VERY frequently to ensure task visibility and proper planning.\n\nWhen to use this tool:\n- Complex multi-step work requiring planning and tracking\n- When user provides multiple tasks or requests (numbered/comma-separated)\n- After receiving new instructions that require multiple steps\n- BEFORE starting work on any todo (mark as in-progress)\n- IMMEDIATELY after completing each todo (mark completed individually)\n- When breaking down larger tasks into smaller actionable steps\n- To give users visibility into your progress and planning\n\nWhen NOT to use:\n- Single, trivial tasks that can be completed in one step\n- Purely conversational/informational requests\n- When just reading files or performing simple searches\n\nCRITICAL workflow:\n1. Plan tasks by writing todo list with specific, actionable items\n2. Mark ONE todo as in-progress before starting work\n3. Complete the work for that specific todo\n4. Mark that todo as completed IMMEDIATELY\n5. Move to next todo and repeat\n\nTodo states:\n- not-started: Todo not yet begun\n- in-progress: Currently working (limit ONE at a time)\n- completed: Finished successfully\n\nIMPORTANT: Mark todos completed as soon as they are done. Do not batch completions.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			operation: {
				type: 'string',
				enum: ['write', 'read'],
				description: 'write: Replace entire todo list with new content. read: Retrieve current todo list. ALWAYS provide complete list when writing - partial updates not supported.'
			},
			todoList: {
				type: 'array',
				description: 'Complete array of all todo items (required for write operation, ignored for read). Must include ALL items - both existing and new.',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'number',
							description: 'Unique identifier for the todo. Use sequential numbers starting from 1.'
						},
						title: {
							type: 'string',
							description: 'Concise action-oriented todo label (3-7 words). Displayed in UI.'
						},
						description: {
							type: 'string',
							description: 'Detailed context, requirements, or implementation notes. Include file paths, specific methods, or acceptance criteria.'
						},
						status: {
							type: 'string',
							enum: ['not-started', 'in-progress', 'completed'],
							description: 'not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished with no blockers'
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
					message = this.generatePastTenseMessage(currentTodoItems, args.todoList);
				}
				break;
			}
			case 'read': {
				message = 'Read todo list';
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
			pastTenseMessage: new MarkdownString(message ?? 'Updated todo list'),
			toolSpecificData: {
				kind: 'todoList',
				sessionId: context.chatSessionId,
				todoList: todoList
			}
		};
	}

	private generatePastTenseMessage(currentTodos: IChatTodo[], newTodos: IManageTodoListToolInputParams['todoList']): string {
		// If no current todos, this is creating new ones
		if (currentTodos.length === 0) {
			return `Created ${newTodos.length} todo${newTodos.length === 1 ? '' : 's'}`;
		}

		// Create map for easier comparison
		const currentTodoMap = new Map(currentTodos.map(todo => [todo.id, todo]));

		// Check for newly started todos (marked as in-progress) - highest priority
		const startedTodos = newTodos.filter(newTodo => {
			const currentTodo = currentTodoMap.get(newTodo.id);
			return currentTodo && currentTodo.status !== 'in-progress' && newTodo.status === 'in-progress';
		});

		if (startedTodos.length > 0) {
			const startedTodo = startedTodos[0]; // Should only be one in-progress at a time
			const totalTodos = newTodos.length;
			const currentPosition = newTodos.findIndex(todo => todo.id === startedTodo.id) + 1;
			return `Starting (${currentPosition}/${totalTodos}) *${startedTodo.title}*`;
		}

		// Check for newly completed todos
		const completedTodos = newTodos.filter(newTodo => {
			const currentTodo = currentTodoMap.get(newTodo.id);
			return currentTodo && currentTodo.status !== 'completed' && newTodo.status === 'completed';
		});

		if (completedTodos.length > 0) {
			const completedTodo = completedTodos[0]; // Get the first completed todo for the message
			const totalTodos = newTodos.length;
			const currentPosition = newTodos.findIndex(todo => todo.id === completedTodo.id) + 1;
			return `Completed (${currentPosition}/${totalTodos}) *${completedTodo.title}*`;
		}

		// Check for new todos added
		const addedTodos = newTodos.filter(newTodo => !currentTodoMap.has(newTodo.id));
		if (addedTodos.length > 0) {
			return `Added ${addedTodos.length} todo${addedTodos.length === 1 ? '' : 's'}`;
		}

		// Default message for other updates
		return 'Updated todo list';
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
