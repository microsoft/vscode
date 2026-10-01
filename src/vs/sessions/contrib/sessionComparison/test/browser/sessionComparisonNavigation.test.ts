/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatTreeItem } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IChatProgressResponseContent } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatRequestViewModel, IChatResponseViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { findSessionTurn } from '../../browser/sessionComparisonNavigation.js';

suite('Session comparison turn navigation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function request(id: string): ChatTreeItem {
		return upcastPartial<IChatRequestViewModel>({ id, dataId: id, messageText: id, message: { text: id, parts: [] } });
	}

	function response(id: string, editedPaths: readonly string[]): ChatTreeItem {
		const value = editedPaths.map(path => upcastPartial<IChatProgressResponseContent>({ kind: 'externalEdit', uri: URI.file(path) }));
		return upcastPartial<IChatResponseViewModel>({ id, dataId: id, requestId: id, setVote: () => { }, response: { value, getMarkdown: () => '', getFinalResponse: () => '', toString: () => '' } });
	}

	const items = [
		request('turn-1'), response('response-1', ['/worktree/src/lexer.ts']),
		request('turn-2'), response('response-2', ['/worktree/src/parser.ts', '/worktree/test/parser.test.ts']),
		request('turn-3'), response('response-3', []),
	];

	test('finds the turn that first edited a referenced file, else the final answer', () => {
		assert.deepStrictEqual([
			findSessionTurn(items, { files: ['src/parser.ts'] })?.id,
			findSessionTurn(items, { files: ['./test/parser.test.ts', 'src/lexer.ts'] })?.id,
			findSessionTurn(items, { files: ['src/missing.ts'] })?.id,
			findSessionTurn(items, {})?.id,
			findSessionTurn([request('only')], { files: ['src/parser.ts'] })?.id,
			findSessionTurn([], undefined)?.id,
		], ['response-2', 'response-1', 'response-3', 'response-3', 'only', undefined]);
	});
});
