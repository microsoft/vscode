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

		try {
			// Get all available tasks
			const tasks = await this._taskService.getKnownTasks();

			if (token.isCancellationRequested) {
				return [];
			}

			const completions: ITerminalCompletion[] = [];

			for (const task of tasks) {
				if (this._shouldIncludeTask(task, value, cursorPosition)) {
					const completion = this._createTaskCompletion(task);
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

	private _shouldIncludeTask(task: Task, value: string, cursorPosition: number): boolean {
		if (task._source.kind === 'extension') {
			return false;
		}
		if (!task._label) {
			return false;
		}

		// Get the text up to the cursor position
		const prefix = value.substring(0, cursorPosition);
		const words = prefix.trim().split(/\s+/);

		// If there are no spaces in value, show all tasks
		if (words.length <= 1) {
			return true;
		}

		// If there are spaces, only show tasks where the words before cursor position
		// (except the word that the cursor is on) match the text of the task exactly
		const wordsBeforeCursor = words.slice(0, -1);
		const taskWords = task._label.trim().split(/\s+/);

		// Check if the task label starts with the exact sequence of words before cursor
		if (wordsBeforeCursor.length > taskWords.length) {
			return false;
		}

		for (let i = 0; i < wordsBeforeCursor.length; i++) {
			if (wordsBeforeCursor[i].toLowerCase() !== taskWords[i].toLowerCase()) {
				return false;
			}
		}

		return true;
	}

	private _createTaskCompletion(task: Task): ITerminalCompletion | undefined {
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
			icon,
			provider: this.id,
			replacementIndex: 0, // Will be set by the completion service
			replacementLength: 0, // Will be set by the completion service
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
