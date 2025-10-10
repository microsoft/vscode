/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITodoTitleValidationResult {
	valid: boolean;
	message?: string;
	sanitizedValue?: string;
}

export const MIN_TITLE_LENGTH = 1;
export const MAX_TITLE_LENGTH = 100;
export const DEFAULT_TODO_TITLE = 'Todos';

export class TodoTitleValidator {
	
	/**
	 * Validates and sanitizes a todo list title
	 * @param value The title to validate
	 * @returns Validation result with sanitized value if valid
	 */
	static validate(value: string): ITodoTitleValidationResult {
		// Trim whitespace
		const trimmed = value.trim();
		
		// Check for empty string
		if (trimmed.length === 0) {
			return {
				valid: false,
				message: 'Title cannot be empty',
				sanitizedValue: DEFAULT_TODO_TITLE
			};
		}
		
		// Check minimum length
		if (trimmed.length < MIN_TITLE_LENGTH) {
			return {
				valid: false,
				message: `Title must be at least ${MIN_TITLE_LENGTH} character`,
				sanitizedValue: DEFAULT_TODO_TITLE
			};
		}
		
		// Check maximum length
		if (trimmed.length > MAX_TITLE_LENGTH) {
			return {
				valid: false,
				message: `Title cannot exceed ${MAX_TITLE_LENGTH} characters`,
				sanitizedValue: trimmed.substring(0, MAX_TITLE_LENGTH)
			};
		}
		
		// Sanitize special characters - allow unicode, emoji, alphanumeric and common punctuation
		const sanitized = trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
		
		return {
			valid: true,
			sanitizedValue: sanitized
		};
	}

	/**
	 * Gets suggested titles based on context
	 */
	static getSuggestions(): string[] {
		return [
			'My Tasks',
			'Sprint Goals',
			'Today\'s Todos',
			'Project Tasks',
			'Action Items',
			'Checklist',
			'To-Do List',
			'Work Items'
		];
	}
}
