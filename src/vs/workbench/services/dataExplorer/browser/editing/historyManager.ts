/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Command } from '../../common/commands.js';

/**
 * Manages the undo/redo history for data explorer operations
 * Implements command pattern with support for command merging
 */
export class HistoryManager extends Disposable {
	
	private undoStack: Command[] = [];
	private redoStack: Command[] = [];
	private readonly maxHistorySize: number = 100;

	private readonly _onDidExecuteCommand = this._register(new Emitter<Command>());
	readonly onDidExecuteCommand: Event<Command> = this._onDidExecuteCommand.event;

	private readonly _onDidUndo = this._register(new Emitter<Command>());
	readonly onDidUndo: Event<Command> = this._onDidUndo.event;

	private readonly _onDidRedo = this._register(new Emitter<Command>());
	readonly onDidRedo: Event<Command> = this._onDidRedo.event;

	private readonly _onDidChangeCanUndo = this._register(new Emitter<boolean>());
	readonly onDidChangeCanUndo: Event<boolean> = this._onDidChangeCanUndo.event;

	private readonly _onDidChangeCanRedo = this._register(new Emitter<boolean>());
	readonly onDidChangeCanRedo: Event<boolean> = this._onDidChangeCanRedo.event;

	/**
	 * Execute a command and add it to the history
	 * @param command The command to execute
	 */
	executeCommand(command: Command): void {
		const previousCanUndo = this.canUndo();
		const previousCanRedo = this.canRedo();

		// Try to merge with the last command if possible
		const lastCommand = this.undoStack[this.undoStack.length - 1];
		if (lastCommand && lastCommand.canMerge?.(command)) {
			try {
				const mergedCommand = lastCommand.merge!(command);
				this.undoStack[this.undoStack.length - 1] = mergedCommand;
				command.execute();
				this._onDidExecuteCommand.fire(command);
			} catch (error) {
				// If merging fails, fall back to regular execution
				this.executeWithoutMerging(command);
			}
		} else {
			this.executeWithoutMerging(command);
		}

		// Notify of state changes
		this.notifyStateChanges(previousCanUndo, previousCanRedo);
	}

	private executeWithoutMerging(command: Command): void {
		// Execute the command
		command.execute();
		
		// Add to undo stack
		this.undoStack.push(command);
		
		// Clear redo stack when new command is executed
		this.redoStack = [];
		
		// Limit history size to prevent memory issues
		if (this.undoStack.length > this.maxHistorySize) {
			this.undoStack.shift();
		}

		this._onDidExecuteCommand.fire(command);
	}

	/**
	 * Undo the last command
	 * @returns true if undo was successful, false if no commands to undo
	 */
	undo(): boolean {
		if (this.undoStack.length === 0) {
			return false;
		}

		const previousCanUndo = this.canUndo();
		const previousCanRedo = this.canRedo();

		const command = this.undoStack.pop()!;
		command.undo();
		this.redoStack.push(command);

		this._onDidUndo.fire(command);
		this.notifyStateChanges(previousCanUndo, previousCanRedo);

		return true;
	}

	/**
	 * Redo the last undone command
	 * @returns true if redo was successful, false if no commands to redo
	 */
	redo(): boolean {
		if (this.redoStack.length === 0) {
			return false;
		}

		const previousCanUndo = this.canUndo();
		const previousCanRedo = this.canRedo();

		const command = this.redoStack.pop()!;
		command.execute();
		this.undoStack.push(command);

		this._onDidRedo.fire(command);
		this.notifyStateChanges(previousCanUndo, previousCanRedo);

		return true;
	}

	/**
	 * Check if undo is possible
	 */
	canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	/**
	 * Check if redo is possible
	 */
	canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	/**
	 * Clear all history
	 */
	clear(): void {
		const previousCanUndo = this.canUndo();
		const previousCanRedo = this.canRedo();

		this.undoStack = [];
		this.redoStack = [];

		this.notifyStateChanges(previousCanUndo, previousCanRedo);
	}

	/**
	 * Get the current undo stack size
	 */
	getUndoStackSize(): number {
		return this.undoStack.length;
	}

	/**
	 * Get the current redo stack size
	 */
	getRedoStackSize(): number {
		return this.redoStack.length;
	}

	/**
	 * Get description of the next command that would be undone
	 */
	getUndoDescription(): string | undefined {
		const lastCommand = this.undoStack[this.undoStack.length - 1];
		return lastCommand?.getDescription?.();
	}

	/**
	 * Get description of the next command that would be redone
	 */
	getRedoDescription(): string | undefined {
		const lastCommand = this.redoStack[this.redoStack.length - 1];
		return lastCommand?.getDescription?.();
	}

	/**
	 * Set the maximum history size
	 */
	setMaxHistorySize(size: number): void {
		if (size <= 0) {
			throw new Error('History size must be greater than 0');
		}

		// If new size is smaller, trim the undo stack
		while (this.undoStack.length > size) {
			this.undoStack.shift();
		}
	}



	private notifyStateChanges(previousCanUndo: boolean, previousCanRedo: boolean): void {
		const currentCanUndo = this.canUndo();
		const currentCanRedo = this.canRedo();

		if (previousCanUndo !== currentCanUndo) {
			this._onDidChangeCanUndo.fire(currentCanUndo);
		}

		if (previousCanRedo !== currentCanRedo) {
			this._onDidChangeCanRedo.fire(currentCanRedo);
		}
	}
}
