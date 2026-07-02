/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildImportedConversation, importedConversationToHistory, IImportedConversationSourceRequest } from '../../common/importedConversation.js';

suite('ImportedConversation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function req(text: string, response?: string, id?: string): IImportedConversationSourceRequest {
		return {
			...(id ? { id } : {}),
			message: { text },
			response: response !== undefined ? { response: { getMarkdown: () => response } } : undefined,
		};
	}

	test('buildImportedConversation captures per-turn prompt/response, skips empty prompts', () => {
		const turns = buildImportedConversation([
			req('hello', 'hi there', 'r1'),
			req('only a question'),
			req('', 'orphan response'),
		]);
		assert.deepStrictEqual(turns, [
			{ requestId: 'r1', prompt: 'hello', response: 'hi there' },
			{ prompt: 'only a question', response: '' },
		]);
	});

	test('importedConversationToHistory yields read-only request/response items', () => {
		const history = importedConversationToHistory([
			{ requestId: 'r1', prompt: 'hello', response: 'hi there' },
			{ prompt: 'no response yet', response: '' },
		], 'agent');
		const summary = history.map(item => item.type === 'request'
			? { type: item.type, prompt: item.prompt, participant: item.participant, isReadonly: item.isReadonly, id: item.id }
			: { type: item.type, participant: item.participant, markdown: item.parts.map(p => p.kind === 'markdownContent' ? p.content.value : p.kind) });
		assert.deepStrictEqual(summary, [
			{ type: 'request', prompt: 'hello', participant: 'agent', isReadonly: true, id: undefined },
			{ type: 'response', participant: 'agent', markdown: ['hi there'] },
			{ type: 'request', prompt: 'no response yet', participant: 'agent', isReadonly: true, id: undefined },
		]);
	});
});
