/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILink {
	readonly label: string;
	readonly href: string;
	readonly title?: string;
}

export type LinkedTextNode = string | ILink;
export type LinkedText = LinkedTextNode[];

const LINK_REGEX = /\[([^\]]+)\]\(((?:https?:\/\/|command:)[^\)\s]+)(?: "([^"]+)")?\)/gi;

export function parseLinkedText(text: string): LinkedText {
	const result: LinkedTextNode[] = [];

	let index = 0;
	let match: RegExpExecArray | null;

	while (match = LINK_REGEX.exec(text)) {
		if (match.index - index > 0) {
			result.push(text.substring(index, match.index));
		}

		const [, label, href, title] = match;

		if (title) {
			result.push({ label, href, title });
		} else {
			result.push({ label, href });
		}

		index = match.index + match[0].length;
	}

	if (index < text.length) {
		result.push(text.substring(index));
	}

	return result;
}
