/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ITaskService } from '../../../tasks/common/taskService.js';
import { Task } from '../../../tasks/common/tasks.js';
import { ITerminalCompletion, TerminalCompletionItemKind } from '../../suggest/browser/terminalCompletionItem.js';
import { ITerminalCompletionProvider } from '../../suggest/browser/terminalCompletionService.js';

export class TaskCompletionProvider implements ITerminalCompletionProvider {
	readonly id = 'tasks';
	readonly isBuiltin = true;

	constructor(
		@ITaskService private readonly _taskService: ITaskService,
	) { }

	async provideCompletions(value: string, cursorPosition: number, allowFallbackCompletions: boolean, token: CancellationToken): Promise<ITerminalCompletion[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		// Get the text up to the cursor position
		const prefix = value.substring(0, cursorPosition);
		const words = prefix.trim().split(/\s+/);

		// Only suggest tasks if we're at the beginning of a command or it's a single word
		// This prevents tasks from appearing in the middle of complex commands
		if (words.length > 1 && prefix.trim() !== words[0]) {
			return [];
		}

		const currentWord = words[words.length - 1] || '';

		try {
			// Get all available tasks
			const tasks = await this._taskService.getKnownTasks();

			if (token.isCancellationRequested) {
				return [];
			}

			const completions: ITerminalCompletion[] = [];

			for (const task of tasks) {
				if (this._shouldIncludeTask(task, currentWord)) {
					const completion = this._createTaskCompletion(task, currentWord);
					if (completion) {
						completions.push(completion);
					}
				}
			}

			return completions;
		} catch (error) {
			// If there's an error fetching tasks, return empty array
			return [];
		}
	}

	private _shouldIncludeTask(task: Task, currentWord: string): boolean {
		if (task._source.kind === 'extension') {
			return false;
		}
		if (!task._label) {
			return false;
		}

		// If no input, don't show tasks (too many)
		if (!currentWord) {
			return false;
		}

		const lowerCurrentWord = currentWord.toLowerCase();
		const lowerTaskLabel = task._label.toLowerCase();

		// Match if the task label starts with the current word
		if (lowerTaskLabel.startsWith(lowerCurrentWord)) {
			return true;
		}

		// Match if any word in the task label starts with the current word
		// This handles cases like "vs code build" matching "build" input
		const taskWords = lowerTaskLabel.split(/\s+/);
		for (const word of taskWords) {
			if (word.startsWith(lowerCurrentWord)) {
				return true;
			}
		}

		// For npm scripts and other tasks, check the task's command and arguments
		// This handles cases where the script name differs from the label
		try {
			const command = this._getTaskCommand(task);
			if (command) {
				// Check command name (e.g., "npm")
				if (command.command && typeof command.command === 'string') {
					if (command.command.toLowerCase().includes(lowerCurrentWord)) {
						return true;
					}
				}

				// Check command arguments (e.g., ["run", "watch"])
				if (command.args && Array.isArray(command.args)) {
					for (const arg of command.args) {
						if (typeof arg === 'string' && arg.toLowerCase().includes(lowerCurrentWord)) {
							return true;
						}
					}
				}
			}
		} catch (error) {
			// Ignore errors accessing task command
		}

		return false;
	}

	private _getTaskCommand(task: Task): any {
		// Handle different task types
		if ('command' in task) {
			return task.command;
		}
		return undefined;
	}

	private _createTaskCompletion(task: Task, currentWord: string): ITerminalCompletion | undefined {
		if (!task._label) {
			return undefined;
		}

		// Use the task label as the display text
		const label = task._label;

		// For input data, we use the full task label
		// The terminal suggest system will handle the replacement appropriately
		const inputData = label;

		// Create a description that includes the task source
		let detail = task.configurationProperties?.detail;
		if (!detail && task._source) {
			detail = `${task._source.label} task`;
		}

		// Get the task icon (use tools icon as default)
		const icon = this._getTaskIcon(task);

		return {
			label,
			inputData,
			detail,
			kind: TerminalCompletionItemKind.VscodeCommand,
			// Lower priority so tasks appear below other suggestions
			// Using a priority that puts them below most other suggestions but above random files
			// priority: 20,
			icon,
			provider: this.id,
			replacementIndex: 0, // Will be set by the completion service
			replacementLength: currentWord.length,
			command: {
				id: 'workbench.action.tasks.runTask',
				arguments: [task]
			}
		};
	}

	private _getTaskIcon(task: Task): ThemeIcon | undefined {
		// Check if the task has a custom icon
		if (task.configurationProperties?.icon) {
			if (typeof task.configurationProperties.icon === 'string') {
				// Try to parse as ThemeIcon
				return ThemeIcon.fromString(task.configurationProperties.icon);
			}
		}

		// Use the tools icon as default for tasks
		return ThemeIcon.fromId(Codicon.tools.id);
	}
}
