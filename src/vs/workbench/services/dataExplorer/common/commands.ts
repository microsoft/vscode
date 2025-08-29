/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Command interface for implementing the Command pattern in the Data Explorer
 * This enables undo/redo functionality for all data operations
 */

export interface Command {
	/**
	 * Execute the command
	 */
	execute(): void;

	/**
	 * Undo the command
	 */
	undo(): void;

	/**
	 * Check if this command can be merged with another command
	 * @param other The other command to check for mergeability
	 * @returns true if the commands can be merged
	 */
	canMerge?(other: Command): boolean;

	/**
	 * Merge this command with another command
	 * @param other The other command to merge with
	 * @returns A new merged command
	 */
	merge?(other: Command): Command;

	/**
	 * Get a description of this command for debugging purposes
	 */
	getDescription?(): string;
}

/**
 * Base class for commands that provides common functionality
 */
export abstract class BaseCommand implements Command {
	
	abstract execute(): void;
	abstract undo(): void;

	canMerge?(other: Command): boolean {
		return false;
	}

	merge?(other: Command): Command {
		throw new Error('This command does not support merging');
	}

	getDescription?(): string {
		return this.constructor.name;
	}
}



