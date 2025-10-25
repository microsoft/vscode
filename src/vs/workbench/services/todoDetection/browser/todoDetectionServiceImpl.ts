/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModel } from '../../../../editor/common/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITodoDetectionService, ITodoItem } from '../common/todoDetectionService.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';

export class TodoDetectionService implements ITodoDetectionService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService
	) { }

	private getTriggers(): string[] {
		const triggers = this.configurationService.getValue<string[]>('chat.delegation.triggers');
		return triggers || ['TODO', 'FIXME', 'BUG', 'HACK', 'NOTE', 'ISSUE'];
	}

	private isCaseSensitive(): boolean {
		return this.configurationService.getValue<boolean>('chat.delegation.caseSensitive') || false;
	}

	detectTodoAtLine(model: ITextModel, lineNumber: number): ITodoItem | undefined {
		if (lineNumber < 1 || lineNumber > model.getLineCount()) {
			return undefined;
		}

		const lineContent = model.getLineContent(lineNumber);
		const languageId = model.getLanguageId();
		const resolvedConfig = this.languageConfigurationService.getLanguageConfiguration(languageId);

		if (!resolvedConfig || !resolvedConfig.comments) {
			return undefined;
		}

		// Get comment tokens
		const commentsConfig = resolvedConfig.comments;
		const lineCommentToken = commentsConfig.lineCommentToken;
		const blockCommentStart = commentsConfig.blockCommentStartToken;
		const blockCommentEnd = commentsConfig.blockCommentEndToken;

		if (!lineCommentToken && !blockCommentStart) {
			return undefined;
		}

		const triggers = this.getTriggers();
		const caseSensitive = this.isCaseSensitive();

		// Check for line comments
		if (lineCommentToken) {
			const commentIndex = lineContent.indexOf(lineCommentToken);
			if (commentIndex !== -1) {
				const commentText = lineContent.substring(commentIndex + lineCommentToken.length).trim();
				const todoItem = this.extractTodoFromText(commentText, triggers, caseSensitive);
				if (todoItem) {
					return {
						range: {
							startLineNumber: lineNumber,
							startColumn: commentIndex + 1,
							endLineNumber: lineNumber,
							endColumn: lineContent.length + 1
						},
						text: commentText,
						trigger: todoItem.trigger,
						lineNumber
					};
				}
			}
		}

		// Check for block comments
		if (blockCommentStart && blockCommentEnd) {
			const blockStartIndex = lineContent.indexOf(blockCommentStart);
			if (blockStartIndex !== -1) {
				const blockEndIndex = lineContent.indexOf(blockCommentEnd, blockStartIndex + blockCommentStart.length);
				let commentText: string;
				if (blockEndIndex !== -1) {
					// Single line block comment
					commentText = lineContent.substring(blockStartIndex + blockCommentStart.length, blockEndIndex).trim();
				} else {
					// Multi-line block comment
					commentText = lineContent.substring(blockStartIndex + blockCommentStart.length).trim();
				}
				const todoItem = this.extractTodoFromText(commentText, triggers, caseSensitive);
				if (todoItem) {
					return {
						range: {
							startLineNumber: lineNumber,
							startColumn: blockStartIndex + 1,
							endLineNumber: lineNumber,
							endColumn: lineContent.length + 1
						},
						text: commentText,
						trigger: todoItem.trigger,
						lineNumber
					};
				}
			}
		}

		return undefined;
	}

	private extractTodoFromText(text: string, triggers: string[], caseSensitive: boolean): { trigger: string } | undefined {
		const searchText = caseSensitive ? text : text.toUpperCase();
		for (const trigger of triggers) {
			const searchTrigger = caseSensitive ? trigger : trigger.toUpperCase();
			// Match trigger at start of comment or after whitespace, followed by colon or whitespace
			const pattern = new RegExp(`^${searchTrigger}\\s*[:\\s]|\\s${searchTrigger}\\s*[:\\s]`);
			if (pattern.test(searchText)) {
				return { trigger };
			}
		}
		return undefined;
	}

	detectAllTodos(model: ITextModel): ITodoItem[] {
		const todos: ITodoItem[] = [];
		const lineCount = model.getLineCount();

		for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			const todo = this.detectTodoAtLine(model, lineNumber);
			if (todo) {
				todos.push(todo);
			}
		}

		return todos;
	}

	hasTodoAtLine(model: ITextModel, lineNumber: number): boolean {
		return this.detectTodoAtLine(model, lineNumber) !== undefined;
	}
}
