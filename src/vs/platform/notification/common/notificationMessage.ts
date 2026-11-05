/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LinkedTextNode } from '../../../base/common/linkedText.js';

/** Notification content constructed from literal text and explicitly authored links, never parsed markup. */
export class NotificationText {

	private constructor(private readonly _nodes: readonly LinkedTextNode[]) {
		Object.freeze(this._nodes);
	}

	get nodes(): readonly LinkedTextNode[] {
		return this._nodes;
	}

	static link(label: string, href: string, title?: string): NotificationText {
		return new NotificationText([Object.freeze(title === undefined ? { label, href } : { label, href, title })]);
	}

	static concat(...parts: (string | NotificationText)[]): NotificationText {
		return new NotificationText(parts.flatMap(part => typeof part === 'string' ? [part] : part._nodes));
	}

	/** Substitutes literal strings and explicit links into a localized template without parsing markup. */
	static format(template: string, ...args: (string | NotificationText)[]): NotificationText {
		const parts: (string | NotificationText)[] = [];
		let index = 0;
		for (const match of template.matchAll(/\{(?<index>\d+)\}/g)) {
			if (match.index > index) {
				parts.push(template.substring(index, match.index));
			}
			parts.push(args[Number(match.groups!.index)] ?? match[0]);
			index = match.index + match[0].length;
		}
		if (index < template.length) {
			parts.push(template.substring(index));
		}
		return NotificationText.concat(...parts);
	}

	/** Transforms displayed text without changing link targets or interpreting the result as markup. */
	mapText(map: (text: string) => string): NotificationText {
		return new NotificationText(this._nodes.map(node => typeof node === 'string' ? map(node) : Object.freeze({ ...node, label: map(node.label) })));
	}

	toString(): string {
		return this._nodes.map(node => typeof node === 'string' ? node : node.label).join('');
	}
}
