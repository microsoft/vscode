/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The leading character that marks a chat message as a terminal command.
 */
export const BANG_COMMAND_PREFIX = '!';

/**
 * Parses a leading `!<command>` at the very start of `prompt`.
 *
 * Like {@link parseRenameCommand}, the marker must be at position 0 (no leading
 * whitespace). A lone `!` or `!` followed only by whitespace is not treated as
 * a bang command — the caller should forward such messages normally.
 *
 * Returns the trimmed command string when the prompt is a bang command, or
 * `undefined` when it is not.
 */
export function parseBangCommand(prompt: string): string | undefined {
	if (!prompt.startsWith(BANG_COMMAND_PREFIX)) {
		return undefined;
	}
	const command = prompt.slice(BANG_COMMAND_PREFIX.length).trim();
	return command.length > 0 ? command : undefined;
}
