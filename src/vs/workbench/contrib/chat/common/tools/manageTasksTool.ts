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
import { IChatTask, IChatTasksService, IChatTaskStorage } from '../chatTasksService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';

const ManageToolSettingId = 'chat.manageTasksTool.enabled';

export const ManageTasksToolData: IToolData = {
	id: 'vscode_tasks_internal',
	toolReferenceName: 'manageTasks',
	when: ContextKeyExpr.equals(`config.${ManageToolSettingId}`, true),
	canBeReferencedInPrompt: false,
	icon: ThemeIcon.fromId(Codicon.checklist.id),
	displayName: 'Manage Tasks',
	modelDescription: 'A tool for managing tasks. Can create/update and read tasks in a todo list. Operations: write (add new todo tasks or update todo tasks), read(retrieve all todo tasks).',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			operation: {
				type: 'string',
				enum: ['write', 'read'],
				description: 'The operation to perform on tasks: write or read.When using write, you must provide the complete list of tasks, including any new or updated items. Partial updates are not supported.'
			},
			taskData: {
				type: 'array',
				description: 'Array of task items to be written.  Ignore for read operation ',
				items: {
					type: 'object',
					properties: {
						id: {
							type: 'number',
							description: 'Numerical identifier representing the position of the task item in the ordered list. Lower numbers have higher priority.'
						},
						title: {
							type: 'string',
							description: 'Short title or summary of the task item.'
						},
						description: {
							type: 'string',
							description: 'Detailed description of the task item.'
						},
						status: {
							type: 'string',
							enum: ['not-started', 'in-progress', 'completed'],
							description: 'Current status of the task item.'
						},
					},
					required: ['id', 'title', 'description', 'status']
				}
			}
		},
		required: ['operation']
	}
};

export interface IManageTasksToolInputParams {

	operation: 'write' | 'read';
	taskData: Array<{
		id: number;
		title: string;
		description: string;
		status: 'not-started' | 'in-progress' | 'completed';
	}>;
}

export class ManageTasksTool extends Disposable implements IToolImpl {

	constructor(
		@IChatTasksService private readonly chatTaskService: IChatTasksService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	async invoke(invocation: IToolInvocation, _countTokens: any, _progress: any, _token: CancellationToken): Promise<IToolResult> {
		const chatSessionId = invocation.context?.sessionId;
		if (chatSessionId === undefined) {
			throw new Error('A chat session ID is required for this tool');
		}

		const args = invocation.parameters as IManageTasksToolInputParams;
		this.logService.debug(`TaskManagerTool: Invoking with options ${JSON.stringify(args)}`);

		try {
			const storage = this.chatTaskService.getChatTasksStorage();

			switch (args.operation) {
				case 'read': {
					const readResult = this.handleReadTasks(storage, chatSessionId);
					return {
						content: [{
							kind: 'text',
							value: readResult
						}]
					};
				}
				case 'write': {
					const tasks: IChatTask[] = args.taskData.map((parsedTask) => ({
						id: parsedTask.id,
						title: parsedTask.title,
						description: parsedTask.description,
						status: parsedTask.status
					}));
					storage.setTasks(chatSessionId, tasks);
					return {
						content: [{
							kind: 'text',
							value: 'Successfully wrote tasks'
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

		const storage = this.chatTaskService.getChatTasksStorage();
		const currentTasks = storage.getTasks(context.chatSessionId);

		const args = context.parameters as IManageTasksToolInputParams;
		let message: string | undefined;
		switch (args.operation) {
			case 'write': {
				if (args.taskData) {
					if (!currentTasks.length) {
						message = 'Creating tasks';
					}
					else {
						message = 'Updating tasks';
					}
				}
				break;
			}
			case 'read': {
				message = 'Reading all tasks';
				break;
			}
			default:
				break;
		}

		const items = args.taskData ?? currentTasks;
		const tasks = items.map(task => ({
			id: task.id.toString(),
			title: task.title,
			description: task.description,
			status: task.status
		}));

		return {
			invocationMessage: new MarkdownString(message ?? 'Unknown task operation'),
			toolSpecificData: {
				kind: 'tasks',
				sessionId: context.chatSessionId,
				tasks: tasks
			}
		};
	}

	private handleReadTasks(storage: IChatTaskStorage, sessionId: string): string {
		const tasks = storage.getTasks(sessionId);

		if (tasks.length === 0) {
			return 'No tasks found.';
		}

		const markdownTaskList = this.formatTasksAsMarkdownTaskList(tasks);

		return `# Task List\n\n${markdownTaskList}`;
	}

	private formatTasksAsMarkdownTaskList(tasks: IChatTask[]): string {
		if (tasks.length === 0) {
			return '';
		}

		return tasks.map(task => {
			let checkbox: string;
			switch (task.status) {
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

			const lines = [`- ${checkbox} ${task.title}`];
			if (task.description && task.description.trim()) {
				lines.push(`  - ${task.description.trim()}`);
			}

			return lines.join('\n');
		}).join('\n');
	}
}
