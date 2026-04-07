/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import Sinon from 'sinon';
import dedent from 'ts-dedent';
import { SyncDescriptor } from '../../../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ICompletionsFetcherService } from '../../networking';
import { CompletionResults, CopilotUiKind, ICompletionsOpenAIFetcherService, LiveOpenAIFetcher } from '../../openai/fetch';
import { APIChoice } from '../../openai/openai';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { createFakeCompletionResponse, fakeCodeReference, StaticFetcher } from '../../test/fetcher';
import { StreamedCompletionSplitter } from '../streamedCompletionSplitter';

suite('StreamedCompletionSplitter', function () {
	function setupSplitter(fetcher: ICompletionsFetcherService, docPrefix = 'function example(arg) {\n', languageId = 'javascript') {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsFetcherService, fetcher);
		serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher)); // gets results from static fetcher
		const accessor = serviceCollection.createTestingAccessor();

		const fetcherService = accessor.get(ICompletionsOpenAIFetcherService);
		const telemetry = TelemetryWithExp.createEmptyConfigForTesting();
		const params = {
			prompt: {
				prefix: docPrefix,
				suffix: '',
				isFimEnabled: false,
				promptElementRanges: [],
			},
			languageId: languageId,
			repoInfo: undefined,
			ourRequestId: 'test-request-id',
			engineModelId: 'test-model-id',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			extra: {},
		};
		const cacheFunction = Sinon.stub<[string, APIChoice], void>();
		const splitter = accessor.get(IInstantiationService).createInstance(StreamedCompletionSplitter, docPrefix, languageId, true, 7, cacheFunction);
		const fetchAndStreamCompletions = async function () {
			return await fetcherService.fetchAndStreamCompletions(params, telemetry, splitter.getFinishedCallback());
		};
		return { splitter, cacheFunction, fetchAndStreamCompletions };
	}

	async function readChoices(result: CompletionResults): Promise<APIChoice[]> {
		const choices = [];
		for await (const choice of result.choices) {
			choices.push(choice);
		}
		return choices;
	}

	test('yields the first line of the completion', async function () {
		const { fetchAndStreamCompletions } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(
					dedent`
					const result = [];
					for (let i = 0; i < arg; i++) {
						result.push(i);
					}
					return result.join(', ');
				`
				)
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		const completions = await readChoices(result);
		assert.strictEqual(completions.length, 1);
		assert.strictEqual(completions[0].completionText, 'const result = [];');
	});

	test('caches the remaining sections of the completion', async function () {
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(
					dedent`
					const result = [];
					for (let i = 0; i < arg; i++) {
						result.push(i);
					}
					return result.join(', ');
				`
				)
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledTwice(cacheFunction);
		Sinon.assert.calledWith(
			cacheFunction,
			'const result = [];',
			Sinon.match({
				completionText: '\nfor (let i = 0; i < arg; i++) {\n\tresult.push(i);\n}',
			})
		);
		Sinon.assert.calledWith(
			cacheFunction,
			'const result = [];\nfor (let i = 0; i < arg; i++) {\n\tresult.push(i);\n}',
			Sinon.match({ completionText: `\nreturn result.join(', ');` })
		);
	});

	test('trims trailing whitespace from cached completions', async function () {
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() => createFakeCompletionResponse('// one\n\n// two  '))
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledWith(cacheFunction, '// one', Sinon.match({ completionText: '\n\n// two' }));
	});

	test('allows single line completions that begin with a newline', async function () {
		const { fetchAndStreamCompletions } = setupSplitter(
			new StaticFetcher(() => createFakeCompletionResponse('\n// one\n// two'))
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		const completions = await readChoices(result);
		assert.strictEqual(completions.length, 1);
		assert.strictEqual(completions[0].completionText, '\n// one');
	});

	test('allows single line completions that begin with a CRLF pair', async function () {
		const { fetchAndStreamCompletions } = setupSplitter(
			new StaticFetcher(() => createFakeCompletionResponse('\r\n// one\r\n// two'))
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		const completions = await readChoices(result);
		assert.strictEqual(completions.length, 1);
		assert.strictEqual(completions[0].completionText, '\r\n// one');
	});

	test('sets generatedChoiceIndex on cached completions', async function () {
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(
					dedent`
					const result = [];
					for (let i = 0; i < arg; i++) {
						result.push(i);
					}
					return result.join(', ');
				`
				)
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledWith(cacheFunction, Sinon.match.string, Sinon.match({ generatedChoiceIndex: 1 }));
		Sinon.assert.calledWith(cacheFunction, Sinon.match.string, Sinon.match({ generatedChoiceIndex: 2 }));
	});

	test('adjusts start_offset in any annotations present in cached split choices', async function () {
		const parts = ['x=1;', '\n\ny=2;', '\n\nz=3;\n'];
		const completion = parts.join('');
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(completion, { annotations: fakeCodeReference(-1, completion.length + 1) })
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledTwice(cacheFunction);
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ start_offset: -parts[0].length - 1 })],
				}),
			})
		);
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ start_offset: -parts[0].length - parts[1].length - 1 })],
				}),
			})
		);
	});

	test('adjusts stop_offset in any annotations present in cached split choices', async function () {
		const parts = ['x=1;', '\n\ny=2;', '\n\nz=3;'];
		const completion = parts.join('');
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(completion, { annotations: fakeCodeReference(-1, completion.length + 1) })
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledTwice(cacheFunction);
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ stop_offset: parts[1].length })],
				}),
			})
		);
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ stop_offset: parts[2].length + 1 })],
				}),
			})
		);
	});

	test('omits any annotation from split choices where start_offset does not intersect the choice', async function () {
		const parts = ['x=1;', '\n\ny=2;', '\n\nz=3;\n'];
		const completion = parts.join('');
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(completion, {
					annotations: fakeCodeReference(parts[0].length + parts[1].length + 3, completion.length + 1),
				})
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledTwice(cacheFunction);
		Sinon.assert.calledWith(cacheFunction, Sinon.match.string, Sinon.match({ copilotAnnotations: undefined }));
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ start_offset: 3 })],
				}),
			})
		);
	});

	test('omits any annotation from split choices where stop_offset does not intersect the choice', async function () {
		const parts = ['x=1;', '\n\ny=2;', '\n\nz=3;\n'];
		const completion = parts.join('');
		const { fetchAndStreamCompletions, cacheFunction } = setupSplitter(
			new StaticFetcher(() =>
				createFakeCompletionResponse(completion, { annotations: fakeCodeReference(-1, parts[0].length + 3) })
			)
		);

		const result = await fetchAndStreamCompletions();

		assert.strictEqual(result.type, 'success');
		await readChoices(result);
		Sinon.assert.calledTwice(cacheFunction);
		Sinon.assert.calledWith(
			cacheFunction,
			Sinon.match.string,
			Sinon.match({
				copilotAnnotations: Sinon.match({
					ip_code_citations: [Sinon.match({ stop_offset: 3 })],
				}),
			})
		);
		Sinon.assert.calledWith(cacheFunction, Sinon.match.string, Sinon.match({ copilotAnnotations: undefined }));
	});
});
