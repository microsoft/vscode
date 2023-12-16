/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { Range } from 'vs/editor/common/core/range';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { ReplyResponse } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { IInlineChatEditResponse, InlineChatResponseType, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

suite('ReplyResponse', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Inline chat widget should not contain Accept and Discard buttons for responses which do not include changes. #3143', async function () {
		const textFileService = new class extends mock<ITextFileService>() { };
		const languageService = new class extends mock<ILanguageService>() { };

		const message = { value: 'hello' };
		const emptyMessage = { value: '' };

		const raw: IInlineChatEditResponse = {
			type: InlineChatResponseType.EditorEdit,
			edits: [],
			message: emptyMessage,
			id: 1234
		};

		{
			const res2 = new ReplyResponse(raw, emptyMessage, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res2.responseType, InlineChatResponseTypes.Empty);
		}
		{
			const res1 = new ReplyResponse({ ...raw, message }, message, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res1.responseType, InlineChatResponseTypes.OnlyMessages);
		}
		{
			const res3 = new ReplyResponse({ ...raw, edits: [{ text: 'EDIT', range: new Range(1, 1, 1, 1) }] }, emptyMessage, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res3.responseType, InlineChatResponseTypes.OnlyEdits);
		}
		{
			const res4 = new ReplyResponse({ ...raw, edits: [{ text: 'EDIT', range: new Range(1, 1, 1, 1) }], message }, message, URI.parse('test:uri'), 1, [], '1', textFileService, languageService);
			assert.strictEqual(res4.responseType, InlineChatResponseTypes.Mixed);
		}
	});
});
