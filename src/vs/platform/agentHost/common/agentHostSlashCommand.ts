/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A slash command token at the start of a user message. */
export interface IParsedLeadingSlashCommand {
	readonly command: string;
	readonly rest: string;
	readonly rawRest: string;
}

/** Parses a leading `/command` token followed by optional whitespace and text. */
export function parseLeadingSlashCommand(prompt: string): IParsedLeadingSlashCommand | undefined {
	const match = /^\/([^\s/]+)(?:$|\s+([\s\S]*))/.exec(prompt);
	if (!match) {
		return undefined;
	}
	const rawRest = match[2] ?? '';
	return {
		command: match[1],
		rest: rawRest.trim(),
		rawRest,
	};
}
