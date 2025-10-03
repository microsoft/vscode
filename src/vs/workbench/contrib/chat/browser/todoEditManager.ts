/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { IChatTodo } from '../common/chatTodoListService.js';

export interface IEditValidationResult {
	isValid: boolean;
	errorMessage?: string;
}

export interface IEditSession {
	todoId: number;
	field: 'title' | 'description';
	originalValue: string;
	currentValue: string;
	isModified: boolean;
}

export class TodoEditManager extends Disposable {
	private _editSessions = new Map<string, IEditSession>();
	private _autoSaveTimeouts = new Map<string, any>();

	private readonly _onDidStartEdit = this._register(new Emitter<{ todo: IChatTodo; field: 'title' | 'description' }>());
	public readonly onDidStartEdit: Event<{ todo: IChatTodo; field: 'title' | 'description' }> = this._onDidStartEdit.event;

	private readonly _onDidCancelEdit = this._register(new Emitter<{ todo: IChatTodo; field: 'title' | 'description' }>());
	public readonly onDidCancelEdit: Event<{ todo: IChatTodo; field: 'title' | 'description' }> = this._onDidCancelEdit.event;

	private readonly _onDidSaveEdit = this._register(new Emitter<{ todo: IChatTodo; field: 'title' | 'description'; newValue: string }>());
	public readonly onDidSaveEdit: Event<{ todo: IChatTodo; field: 'title' | 'description'; newValue: string }> = this._onDidSaveEdit.event;

	constructor(
		private readonly autoSaveDelay: number = 2000
	) {
		super();
	}

	/**
	 * Start an edit session for a todo item
	 */
	public startEdit(todo: IChatTodo, field: 'title' | 'description'): IEditSession {
		const sessionKey = this.getSessionKey(todo.id, field);
		const existingSession = this._editSessions.get(sessionKey);
		
		if (existingSession) {
			return existingSession;
		}

		const originalValue = field === 'title' ? todo.title : (todo.description || '');
		const session: IEditSession = {
			todoId: todo.id,
			field,
			originalValue,
			currentValue: originalValue,
			isModified: false
		};

		this._editSessions.set(sessionKey, session);
		this._onDidStartEdit.fire({ todo, field });

		return session;
	}

	/**
	 * Update the current value in an edit session
	 */
	public updateEditValue(todoId: number, field: 'title' | 'description', value: string): void {
		const sessionKey = this.getSessionKey(todoId, field);
		const session = this._editSessions.get(sessionKey);

		if (!session) {
			return;
		}

		session.currentValue = value;
		session.isModified = value !== session.originalValue;

		// Clear existing auto-save timeout
		const existingTimeout = this._autoSaveTimeouts.get(sessionKey);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set up new auto-save timeout if value is modified
		if (session.isModified && this.autoSaveDelay > 0) {
			const timeout = setTimeout(() => {
				this.saveEdit(todoId, field);
			}, this.autoSaveDelay);
			this._autoSaveTimeouts.set(sessionKey, timeout);
		}
	}

	/**
	 * Cancel an edit session
	 */
	public cancelEdit(todo: IChatTodo, field: 'title' | 'description'): void {
		const sessionKey = this.getSessionKey(todo.id, field);
		const session = this._editSessions.get(sessionKey);

		if (!session) {
			return;
		}

		// Clear auto-save timeout
		const timeout = this._autoSaveTimeouts.get(sessionKey);
		if (timeout) {
			clearTimeout(timeout);
			this._autoSaveTimeouts.delete(sessionKey);
		}

		this._editSessions.delete(sessionKey);
		this._onDidCancelEdit.fire({ todo, field });
	}

	/**
	 * Save an edit session
	 */
	public saveEdit(todoId: number, field: 'title' | 'description'): string | undefined {
		const sessionKey = this.getSessionKey(todoId, field);
		const session = this._editSessions.get(sessionKey);

		if (!session) {
			return undefined;
		}

		// Clear auto-save timeout
		const timeout = this._autoSaveTimeouts.get(sessionKey);
		if (timeout) {
			clearTimeout(timeout);
			this._autoSaveTimeouts.delete(sessionKey);
		}

		const newValue = session.currentValue.trim();
		this._editSessions.delete(sessionKey);

		// We need to get the todo object to fire the event, but we don't have direct access
		// The caller will handle the actual save and provide the todo object
		return newValue;
	}

	/**
	 * Validate edit input
	 */
	public validateEdit(field: 'title' | 'description', value: string): IEditValidationResult {
		const trimmedValue = value.trim();

		if (field === 'title') {
			if (trimmedValue.length === 0) {
				return {
					isValid: false,
					errorMessage: 'Title cannot be empty'
				};
			}

			if (trimmedValue.length > 200) {
				return {
					isValid: false,
					errorMessage: 'Title cannot exceed 200 characters'
				};
			}
		} else if (field === 'description') {
			if (trimmedValue.length > 500) {
				return {
					isValid: false,
					errorMessage: 'Description cannot exceed 500 characters'
				};
			}
		}

		return { isValid: true };
	}

	/**
	 * Check if a todo field is currently being edited
	 */
	public isEditing(todoId: number, field: 'title' | 'description'): boolean {
		const sessionKey = this.getSessionKey(todoId, field);
		return this._editSessions.has(sessionKey);
	}

	/**
	 * Get current edit session
	 */
	public getEditSession(todoId: number, field: 'title' | 'description'): IEditSession | undefined {
		const sessionKey = this.getSessionKey(todoId, field);
		return this._editSessions.get(sessionKey);
	}

	/**
	 * Handle conflict when AI updates a todo being edited
	 */
	public handleConflict(todo: IChatTodo, field: 'title' | 'description', newAiValue: string): 'keep-edit' | 'accept-ai' {
		const session = this.getEditSession(todo.id, field);
		
		if (!session) {
			return 'accept-ai';
		}

		// If user hasn't made any changes, accept AI update
		if (!session.isModified) {
			this.cancelEdit(todo, field);
			return 'accept-ai';
		}

		// If user has modified the value, keep their edit
		// In a real implementation, we might want to show a conflict resolution UI
		return 'keep-edit';
	}

	/**
	 * Get all active edit sessions
	 */
	public getActiveEditSessions(): IEditSession[] {
		return Array.from(this._editSessions.values());
	}

	/**
	 * Cancel all edit sessions
	 */
	public cancelAllEdits(): void {
		// Clear all auto-save timeouts
		for (const timeout of this._autoSaveTimeouts.values()) {
			clearTimeout(timeout);
		}
		this._autoSaveTimeouts.clear();
		this._editSessions.clear();
	}

	private getSessionKey(todoId: number, field: 'title' | 'description'): string {
		return `${todoId}-${field}`;
	}

	override dispose(): void {
		this.cancelAllEdits();
		super.dispose();
	}
}
