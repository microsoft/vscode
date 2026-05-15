/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { beforeEach, suite, test } from 'vitest';
import { IResponsePart } from '../../../platform/chat/common/chatMLFetcher';
import { TextDocumentSnapshot } from '../../../platform/editing/common/textDocumentSnapshot';
import { MockEndpoint } from '../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../platform/test/node/services';
import { ChatResponseStreamImpl } from '../../../util/common/chatResponseStreamImpl';
import { createTextDocumentData } from '../../../util/common/test/shims/textDocument';
import { AsyncIterableObject } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatResponseTextEditPart, Range, Selection, TextEdit, Uri } from '../../../vscodeTypes';
import { ISessionTurnStorage, OutcomeAnnotation } from '../../inlineChat/node/promptCraftingTypes';
import { ChatVariablesCollection } from '../../prompt/common/chatVariablesCollection';
import { PromptReference, getUniqueReferences } from '../../prompt/common/conversation';
import { IDocumentContext } from '../../prompt/node/documentContext';
import { IResponseProcessorContext, ReplyInterpreterMetaData } from '../../prompt/node/intents';
import { PromptRenderer } from '../../prompts/node/base/promptRenderer';
import { InlineChatEditCodePrompt } from '../../prompts/node/inline/inlineChatEditCodePrompt';
import { createExtensionUnitTestingServices } from './services';


suite('Intent Streaming', function () {

	let accessor: ITestingServicesAccessor;

	beforeEach(function () {
		accessor = createExtensionUnitTestingServices().createTestingAccessor();
	});

	test.skip('[Bug] Stream processing may never terminate if model responds with something other than an edit #2080', async function () {


		const data = createTextDocumentData(URI.from({ scheme: 'test', path: '/path/file.txt' }), 'Hello', 'fooLang');
		const doc = TextDocumentSnapshot.create(data.document);

		const context: IDocumentContext = {
			document: doc,
			language: { languageId: doc.languageId, lineComment: { start: '//' } },
			fileIndentInfo: undefined,
			wholeRange: new Range(0, 0, 1, 0),
			selection: new Selection(0, 0, 0, 0),
		};

		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, undefined);
		const progressReporter = { report() { } };
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, InlineChatEditCodePrompt, {
			documentContext: context,
			promptContext: {
				query: 'hello',
				chatVariables: new ChatVariablesCollection([]),
				history: [],
			}
		});
		const result = await renderer.render(progressReporter, CancellationToken.None);
		const replyInterpreter = result.metadata.get(ReplyInterpreterMetaData)!.replyInterpreter;
		const stream = new ChatResponseStreamImpl((value) => {
			if (value instanceof ChatResponseTextEditPart) {
				values.push(...value.edits);
			}
		}, () => { }, undefined, undefined, undefined, () => Promise.resolve(undefined));
		const values: TextEdit[] = [];

		const part: IResponsePart = {
			delta: {
				text: 'What can be done'
			}
		};
		const context2: IResponseProcessorContext = {
			addAnnotations: function (annotations: OutcomeAnnotation[]): void {
				// nothing
			},
			storeInInlineSession: function (store: ISessionTurnStorage): void {
				// nothing
			},
			chatSessionId: '',
			turn: null!,
			messages: []
		};
		await replyInterpreter.processResponse(context2, AsyncIterableObject.fromArray([part]), stream, CancellationToken.None);

		assert.strictEqual(values.length, 0);
	});
});

suite('Reference Processing', function () {
	test('combines adjacent lines and full file overlap', async () => {
		const uri1 = Uri.file('1.txt');
		const uri2 = Uri.file('2.txt');
		const uri3 = Uri.file('3.txt');

		const references = [
			new PromptReference({
				uri: uri1,
				range: new Range(0, 0, 2, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(3, 0, 4, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(5, 0, 7, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(0, 0, 4, 0),
			}), new PromptReference(uri3),
			new PromptReference({
				uri: uri3,
				range: new Range(0, 0, 4, 0),
			})
		];

		const result = getUniqueReferences(references);

		assert.deepEqual(result,
			[
				new PromptReference({
					uri: uri1,
					range: new Range(0, 0, 7, 0),
				}), new PromptReference({
					uri: uri2,
					range: new Range(0, 0, 4, 0),
				}), new PromptReference(uri3)
			]);
	});

	test('combines overlaping ranges', async () => {
		const uri1 = Uri.file('1.txt');
		const uri2 = Uri.file('2.txt');

		const references = [
			new PromptReference({
				uri: uri1,
				range: new Range(0, 0, 2, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(5, 0, 10, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(3, 0, 6, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(1, 0, 4, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(0, 0, 5, 0),
			})
		];

		const result = getUniqueReferences(references);

		assert.deepEqual(result,
			[
				new PromptReference({
					uri: uri1,
					range: new Range(0, 0, 10, 0),
				}), new PromptReference({
					uri: uri2,
					range: new Range(0, 0, 5, 0),
				})

			]);
	});

	test('removes duplicates', async () => {
		const uri1 = Uri.file('1.txt');
		const uri2 = Uri.file('2.txt');

		const references = [
			new PromptReference({
				uri: uri1,
				range: new Range(3, 0, 4, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(3, 0, 4, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(3, 0, 4, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(3, 0, 4, 0),
			})
		];

		const result = getUniqueReferences(references);


		assert.deepEqual(result, [
			new PromptReference({
				uri: uri1,
				range: new Range(3, 0, 4, 0),
			}), new PromptReference({
				uri: uri2,
				range: new Range(3, 0, 4, 0),
			}),

		]);
	});





	test('leaves distinct ranges alone, but sorts them', async () => {
		const uri1 = Uri.file('1.txt');
		const uri2 = Uri.file('2.txt');

		const references = [
			new PromptReference({
				uri: uri1,
				range: new Range(7, 0, 10, 0),
			}),
			new PromptReference({
				uri: uri2,
				range: new Range(4, 0, 5, 0),
			}),
			new PromptReference({
				uri: uri1,
				range: new Range(0, 0, 2, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(4, 0, 5, 0),
			}),
		];

		const result = getUniqueReferences(references);


		assert.deepEqual(result, [
			new PromptReference({
				uri: uri1,
				range: new Range(0, 0, 2, 0),
			}), new PromptReference({
				uri: uri1,
				range: new Range(4, 0, 5, 0),
			}),
			new PromptReference({
				uri: uri1,
				range: new Range(7, 0, 10, 0),
			}),
			new PromptReference({
				uri: uri2,
				range: new Range(4, 0, 5, 0),
			}),
		]);
	});
});
