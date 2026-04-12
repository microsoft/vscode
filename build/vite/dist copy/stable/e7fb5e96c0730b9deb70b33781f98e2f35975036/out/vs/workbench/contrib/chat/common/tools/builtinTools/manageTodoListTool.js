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
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { ToolDataSource } from '../languageModelToolsService.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatTodoListService } from '../chatTodoListService.js';
import { localize } from '../../../../../../nls.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../base/common/uri.js';
export const ManageTodoListToolToolId = 'manage_todo_list';
export function createManageTodoListToolData() {
    const inputSchema = {
        type: 'object',
        properties: {
            todoList: {
                type: 'array',
                description: 'Complete array of all todo items. Must include ALL items - both existing and new.',
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
                        status: {
                            type: 'string',
                            enum: ['not-started', 'in-progress', 'completed'],
                            description: 'not-started: Not begun | in-progress: Currently working (max 1) | completed: Fully finished with no blockers'
                        },
                    },
                    required: ['id', 'title', 'status']
                }
            }
        },
        required: ['todoList']
    };
    return {
        id: ManageTodoListToolToolId,
        toolReferenceName: 'todo',
        legacyToolReferenceFullNames: ['todos'],
        canBeReferencedInPrompt: true,
        icon: ThemeIcon.fromId(Codicon.checklist.id),
        displayName: localize('tool.manageTodoList.displayName', 'Manage and track todo items for task planning'),
        userDescription: localize('tool.manageTodoList.userDescription', 'Manage and track todo items for task planning'),
        modelDescription: 'Manage a structured todo list to track progress and plan tasks throughout your coding session. Use this tool VERY frequently to ensure task visibility and proper planning.\n\nWhen to use this tool:\n- Complex multi-step work requiring planning and tracking\n- When user provides multiple tasks or requests (numbered/comma-separated)\n- After receiving new instructions that require multiple steps\n- BEFORE starting work on any todo (mark as in-progress)\n- IMMEDIATELY after completing each todo (mark completed individually)\n- When breaking down larger tasks into smaller actionable steps\n- To give users visibility into your progress and planning\n\nWhen NOT to use:\n- Single, trivial tasks that can be completed in one step\n- Purely conversational/informational requests\n- When just reading files or performing simple searches\n\nCRITICAL workflow:\n1. Plan tasks by writing todo list with specific, actionable items\n2. Mark ONE todo as in-progress before starting work\n3. Complete the work for that specific todo\n4. Mark that todo as completed IMMEDIATELY\n5. Move to next todo and repeat\n\nTodo states:\n- not-started: Todo not yet begun\n- in-progress: Currently working (limit ONE at a time)\n- completed: Finished successfully\n\nIMPORTANT: Mark todos completed as soon as they are done. Do not batch completions.',
        source: ToolDataSource.Internal,
        inputSchema: inputSchema
    };
}
export const ManageTodoListToolData = createManageTodoListToolData();
let ManageTodoListTool = class ManageTodoListTool extends Disposable {
    constructor(chatTodoListService, logService, telemetryService) {
        super();
        this.chatTodoListService = chatTodoListService;
        this.logService = logService;
        this.telemetryService = telemetryService;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async invoke(invocation, _countTokens, _progress, _token) {
        const args = invocation.parameters;
        let chatSessionResource = invocation.context?.sessionResource;
        if (!chatSessionResource && args.operation === 'read' && args.chatSessionResource) {
            try {
                chatSessionResource = URI.parse(args.chatSessionResource);
            }
            catch (error) {
                this.logService.error('ManageTodoListTool: Invalid chatSessionResource URI', error);
            }
        }
        if (!chatSessionResource) {
            return {
                content: [{
                        kind: 'text',
                        value: 'Error: No session resource available'
                    }]
            };
        }
        this.logService.debug(`ManageTodoListTool: Invoking with options ${JSON.stringify(args)}`);
        try {
            if (args.operation === 'read') {
                return this.handleReadOperation(chatSessionResource);
            }
            else {
                return this.handleWriteOperation(args, chatSessionResource);
            }
        }
        catch (error) {
            const errorMessage = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            return {
                content: [{
                        kind: 'text',
                        value: errorMessage
                    }]
            };
        }
    }
    async prepareToolInvocation(context, _token) {
        const args = context.parameters;
        const chatSessionResource = context.chatSessionResource;
        if (!chatSessionResource) {
            return undefined;
        }
        const currentTodoItems = this.chatTodoListService.getTodos(chatSessionResource);
        let message;
        if (args.operation === 'read') {
            message = localize('todo.readOperation', "Read todo list");
        }
        else if (args.todoList) {
            message = this.generatePastTenseMessage(currentTodoItems, args.todoList);
        }
        const items = args.todoList ?? currentTodoItems;
        const todoList = items.map(todo => ({
            id: todo.id.toString(),
            title: todo.title,
            status: todo.status
        }));
        const invocationLabel = message?.replace(/^(Starting|Completed): /i, '') ?? localize('todo.updatingList', "Updating todo list");
        const invocationMessage = new MarkdownString(invocationLabel);
        return {
            invocationMessage,
            pastTenseMessage: new MarkdownString(message ?? localize('todo.updatedList', "Updated todo list")),
            toolSpecificData: {
                kind: 'todoList',
                todoList: todoList
            }
        };
    }
    generatePastTenseMessage(currentTodos, newTodos) {
        // If no current todos, this is creating new ones
        if (currentTodos.length === 0) {
            return newTodos.length === 1
                ? localize('todo.created.single', "Created 1 todo")
                : localize('todo.created.multiple', "Created {0} todos", newTodos.length);
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
            return localize('todo.starting', "Starting: *{0}* ({1}/{2})", startedTodo.title, currentPosition, totalTodos);
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
            return localize('todo.completed', "Completed: *{0}* ({1}/{2})", completedTodo.title, currentPosition, totalTodos);
        }
        // Check for new todos added
        const addedTodos = newTodos.filter(newTodo => !currentTodoMap.has(newTodo.id));
        if (addedTodos.length > 0) {
            return addedTodos.length === 1
                ? localize('todo.added.single', "Added 1 todo")
                : localize('todo.added.multiple', "Added {0} todos", addedTodos.length);
        }
        // Default message for other updates
        return localize('todo.updated', "Updated todo list");
    }
    handleRead(todoItems, sessionResource) {
        if (todoItems.length === 0) {
            return 'No todo list found.';
        }
        const markdownTaskList = this.formatTodoListAsMarkdownTaskList(todoItems);
        return `# Todo List\n\n${markdownTaskList}`;
    }
    handleReadOperation(chatSessionResource) {
        const todoItems = this.chatTodoListService.getTodos(chatSessionResource);
        const readResult = this.handleRead(todoItems, chatSessionResource);
        const statusCounts = this.calculateStatusCounts(todoItems);
        this.telemetryService.publicLog2('todoListToolInvoked', {
            operation: 'read',
            notStartedCount: statusCounts.notStartedCount,
            inProgressCount: statusCounts.inProgressCount,
            completedCount: statusCounts.completedCount
        });
        return {
            content: [{
                    kind: 'text',
                    value: readResult
                }]
        };
    }
    handleWriteOperation(args, chatSessionResource) {
        if (!args.todoList) {
            return {
                content: [{
                        kind: 'text',
                        value: 'Error: todoList is required for write operation'
                    }]
            };
        }
        const todoList = args.todoList.map((parsedTodo) => ({
            id: parsedTodo.id,
            title: parsedTodo.title,
            status: parsedTodo.status
        }));
        const existingTodos = this.chatTodoListService.getTodos(chatSessionResource);
        const changes = this.calculateTodoChanges(existingTodos, todoList);
        this.chatTodoListService.setTodos(chatSessionResource, todoList);
        const statusCounts = this.calculateStatusCounts(todoList);
        // Build warnings
        const warnings = [];
        if (todoList.length < 3) {
            warnings.push('Warning: Small todo list (<3 items). This task might not need a todo list.');
        }
        else if (todoList.length > 10) {
            warnings.push('Warning: Large todo list (>10 items). Consider keeping the list focused and actionable.');
        }
        if (changes > 3) {
            warnings.push('Warning: Did you mean to update so many todos at the same time? Consider working on them one by one.');
        }
        this.telemetryService.publicLog2('todoListToolInvoked', {
            operation: 'write',
            notStartedCount: statusCounts.notStartedCount,
            inProgressCount: statusCounts.inProgressCount,
            completedCount: statusCounts.completedCount
        });
        return {
            content: [{
                    kind: 'text',
                    value: `Successfully wrote todo list${warnings.length ? '\n\n' + warnings.join('\n') : ''}`
                }],
            toolMetadata: {
                warnings: warnings
            }
        };
    }
    calculateStatusCounts(todos) {
        const notStartedCount = todos.filter(todo => todo.status === 'not-started').length;
        const inProgressCount = todos.filter(todo => todo.status === 'in-progress').length;
        const completedCount = todos.filter(todo => todo.status === 'completed').length;
        return { notStartedCount, inProgressCount, completedCount };
    }
    formatTodoListAsMarkdownTaskList(todoList) {
        if (todoList.length === 0) {
            return '';
        }
        return todoList.map(todo => {
            let checkbox;
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
            return lines.join('\n');
        }).join('\n');
    }
    calculateTodoChanges(oldList, newList) {
        // Assume arrays are equivalent in order; compare index-by-index
        let modified = 0;
        const minLen = Math.min(oldList.length, newList.length);
        for (let i = 0; i < minLen; i++) {
            const o = oldList[i];
            const n = newList[i];
            if (o.title !== n.title || o.status !== n.status) {
                modified++;
            }
        }
        const added = Math.max(0, newList.length - oldList.length);
        const removed = Math.max(0, oldList.length - newList.length);
        const totalChanges = added + removed + modified;
        return totalChanges;
    }
};
ManageTodoListTool = __decorate([
    __param(0, IChatTodoListService),
    __param(1, ILogService),
    __param(2, ITelemetryService)
], ManageTodoListTool);
export { ManageTodoListTool };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFuYWdlVG9kb0xpc3RUb29sLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvYnVpbHRpblRvb2xzL21hbmFnZVRvZG9MaXN0VG9vbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBRXBFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBS04sY0FBYyxFQUdkLE1BQU0saUNBQWlDLENBQUM7QUFDekMsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBYSxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTNELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGtCQUFrQixDQUFDO0FBRTNELE1BQU0sVUFBVSw0QkFBNEI7SUFDM0MsTUFBTSxXQUFXLEdBQWlEO1FBQ2pFLElBQUksRUFBRSxRQUFRO1FBQ2QsVUFBVSxFQUFFO1lBQ1gsUUFBUSxFQUFFO2dCQUNULElBQUksRUFBRSxPQUFPO2dCQUNiLFdBQVcsRUFBRSxtRkFBbUY7Z0JBQ2hHLEtBQUssRUFBRTtvQkFDTixJQUFJLEVBQUUsUUFBUTtvQkFDZCxVQUFV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