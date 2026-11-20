/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { markdownToPlainText } from '../../../base/common/markdown.js';
import { createRegExp } from '../../../base/common/strings.js';
import type { SearchChatTurnsParams } from '../common/state/protocol/channels-chat/commands.js';

export interface IChatSearchText {
	readonly request: string;
	readonly markdown: readonly string[];
}

export interface IChatMatchCounts {
	readonly request: number;
	readonly response: number;
}

function count(text: string, regex: RegExp): number {
	let result = 0;
	for (const match of text.matchAll(regex)) {
		if (match[0].length) {
			result++;
		}
	}
	return result;
}

process.once('message', ({ params, batch }: { params: SearchChatTurnsParams; batch: IChatSearchText[] }) => {
	let pattern: RegExp;
	try {
		pattern = createRegExp(params.query, params.isRegex === true, { matchCase: params.matchCase, wholeWord: params.wholeWord, global: true, unicode: true });
	} catch {
		process.send!('invalid');
		return;
	}
	process.send!(batch.map(({ request, markdown }): IChatMatchCounts => ({
		request: count(request, pattern),
		response: markdown.reduce((total, part) => total + count(markdownToPlainText(part), pattern), 0),
	})));
});
