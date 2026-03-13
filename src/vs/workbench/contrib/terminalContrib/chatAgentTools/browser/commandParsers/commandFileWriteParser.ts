/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interface for command-specific file write parsers.
 * Each parser is responsible for detecting when a specific command will write to files
 * (beyond simple shell redirections which are handled separately via tree-sitter queries).
 */
export interface ICommandFileWriteParser {
	/**
	 * The name of the command this parser handles (e.g., 'sed', 'tee').
	 */
	readonly commandName: string;

	/**
	 * Checks if this parser can handle the given command text.
	 * Should return true only if the command would write to files.
	 * @param commandText The full text of a single command (not a pipeline).
	 */
	canHandle(commandText: string): boolean;

	/**
	 * Extracts the file paths that would be written to by this command.
	 * Should only be called if canHandle() returns true.
	 * @param commandText The full text of a single command (not a pipeline).
	 * @returns Array of file paths that would be modified.
	 */
	extractFileWrites(commandText: string): string[];
}
