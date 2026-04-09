/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Position } from 'shiki/core';
import dedent from 'ts-dedent';
import type { CancellationToken } from 'vscode';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import { ILogService } from '../../../../../../../platform/log/common/logService';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { SyncDescriptor } from '../../../../../../../util/vs/platform/instantiation/common/descriptors';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { LlmNESTelemetryBuilder } from '../../../../../../inlineEdits/node/nextEditProviderTelemetry';
import { GhostTextLogContext } from '../../../../../common/ghostTextContext';
import { initializeTokenizers } from '../../../../prompt/src/tokenization';
import { CompletionState, createCompletionState } from '../../completionState';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { ICompletionsFetcherService, Response } from '../../networking';
import { ICompletionsOpenAIFetcherService, LiveOpenAIFetcher } from '../../openai/fetch';
import { fakeAPIChoice, fakeAPIChoiceFromCompletion } from '../../openai/fetch.fake';
import { APIChoice } from '../../openai/openai';
import { extractPrompt, PromptResponsePresent, trimLastLine } from '../../prompt/prompt';
import { getGhostTextInternal } from '../../prompt/test/prompt';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { createFakeCompletionResponse, fakeCodeReference, NoFetchFetcher, StaticFetcher } from '../../test/fetcher';
import { withInMemoryTelemetry } from '../../test/telemetry';
import { createTextDocument } from '../../test/textDocument';
import { ITextDocument, LocationFactory } from '../../textDocument';
import { Deferred } from '../../util/async';
import { ICompletionsAsyncManagerService } from '../asyncCompletions';
import { ICompletionsCacheService } from '../completionsCache';
import { GetNetworkCompletionsType } from '../completionsFromNetwork';
import { ICompletionsCurrentGhostText } from '../current';
import { getGhostText, GhostCompletion } from '../ghostText';
import { ResultType } from '../resultType';
import { mkBasicResultTelemetry } from '../telemetry';

// Unit tests for ghostText that do not require network connectivity. For other
// tests, see lib/e2e/src/ghostText.test.ts.

suite('Isolated GhostText tests', function () {
	function getPrefix(completionState: CompletionState): string {
		return trimLastLine(
			completionState.textDocument.getText(
				LocationFactory.range(LocationFactory.position(0, 0), completionState.position)
			)
		)[0];
	}

	function setupCompletion(
		fetcher: ICompletionsFetcherService,
		docText = 'import "fmt"\n\nfunc fizzbuzz(n int) {\n\n}\n',
		position = LocationFactory.position(3, 0),
		languageId = 'go',
		token?: CancellationToken
	) {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsFetcherService, fetcher);
		serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher)); // gets results from static fetcher
		const accessor = serviceCollection.createTestingAccessor();

		const filePath = 'file:///fizzbuzz.go';
		const doc = createTextDocument(filePath, languageId, 1, docText);
		const state = createCompletionState(doc, position);
		const prefix = getPrefix(state);

		// Setup closures with the state as default
		function requestGhostText(completionState = state) {
			const telemetryBuilder = new LlmNESTelemetryBuilder(undefined, undefined, undefined, 'ghostText', undefined);
			const logService = accessor.get(ILogService);
			return getGhostText(accessor, completionState, token, {}, new GhostTextLogContext(filePath, doc.version, undefined), telemetryBuilder, logService);
		}
		async function requestPrompt(completionState = state) {
			const telemExp = TelemetryWithExp.createEmptyConfigForTesting();
			const result = await extractPrompt(accessor, 'COMPLETION_ID', completionState, telemExp);
			return (result as PromptResponsePresent).prompt;
		}

		// Note, that we return a copy of the state to avoid side effects
		return {
			accessor,
			doc,
			position,
			prefix,
			state: createCompletionState(doc, position),
			requestGhostText,
			requestPrompt,
		};
	}

	function addToCache(accessor: ServicesAccessor, prefix: string, suffix: string, completion: string | APIChoice) {
		let choice: APIChoice;
		if (typeof completion === 'string') {
			choice = fakeAPIChoiceFromCompletion(completion);
		} else {
			choice = completion;
		}
		const cache = accessor.get(ICompletionsCacheService);
		cache.append(prefix, suffix, choice);
	}

	async function acceptAndRequestNextCompletion(
		accessor: ServicesAccessor,
		origDoc: ITextDocument,
		origPosition: Position,
		completion: GhostCompletion
	) {
		const doc = createTextDocument(
			origDoc.uri,
			origDoc.clientLanguageId,
			origDoc.version + 1,
			origDoc.getText(LocationFactory.range(LocationFactory.position(0, 0), origPosition)) +
			completion.completionText +
			origDoc.getText(LocationFactory.range(origPosition, origDoc.positionAt(origDoc.getText().length)))
		);
		const position = doc.positionAt(doc.offsetAt(origPosition) + completion.completionText.length);
		const result = await getGhostTextInternal(accessor, doc, position);
		return { doc, position, result };
	}

	suiteSetup(async function () {
		await initializeTokenizers;
	});

	test('returns annotations in the result', async function () {
		const { requestGhostText } = setupCompletion(
			new StaticFetcher(() =>
				createFakeCompletionResponse('\tfor i := 1; i<= n; i++ {\n', {
					annotations: fakeCodeReference(-18, 26, 'NOASSERTION', 'https://github.com/github/example'),
				})
			)
		);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.deepStrictEqual(responseWithTelemetry.value[0][0].copilotAnnotations?.ip_code_citations, [
			{
				id: 5,
				start_offset: -18,
				stop_offset: 26,
				details: { citations: [{ url: 'https://github.com/github/example', license: 'NOASSERTION' }] },
			},
		]);
	});

	test('returns cached completion', async function () {
		const { accessor, requestGhostText, prefix, requestPrompt } = setupCompletion(new NoFetchFetcher());
		const completionText = '\tfor i := 1; i<= n; i++ {';
		const { suffix } = await requestPrompt();
		addToCache(accessor, prefix, suffix, completionText);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, completionText);
		assert.strictEqual(responseWithTelemetry.value[1], ResultType.Cache, 'result type should be cache');
	});

	test('returns empty response when cached completion is filtered by post-processing', async function () {
		const completionText = '\tvar i int';
		const { accessor, requestGhostText, prefix, requestPrompt } = setupCompletion(
			new StaticFetcher(() => createFakeCompletionResponse(completionText))
		);
		const { suffix } = await requestPrompt();
		addToCache(accessor, prefix, suffix, '}'); // Completion matches next line of document

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'empty');
		assert.strictEqual(responseWithTelemetry.reason, 'cached results empty after post-processing');
	});

	test('returns typing as suggested', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(new NoFetchFetcher());
		const { suffix } = await requestPrompt();
		addToCache(accessor, prefix, suffix, '\tfor i := 1; i<= n; i++ {');
		await requestGhostText();

		const secondText = 'import "fmt"\n\nfunc fizzbuzz(n int) {\n\tfor\n}\n';
		const second = createCompletionState(
			createTextDocument('file:///fizzbuzz.go', 'go', 1, secondText),
			LocationFactory.position(3, 4)
		);
		const responseWithTelemetry = await requestGhostText(second);

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, ' i := 1; i<= n; i++ {');
		assert.strictEqual(
			responseWithTelemetry.value[1],
			ResultType.TypingAsSuggested,
			'result type should be typing as suggested'
		);
	});

	test('returns multiline typing as suggested when typing into single line context', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(new NoFetchFetcher());
		const currentGhostText = accessor.get(ICompletionsCurrentGhostText);
		currentGhostText.hasAcceptedCurrentCompletion = () => true;
		const { suffix } = await requestPrompt();
		const completionText = '\tfmt.Println("hi")\n\tfmt.Print("hello")';
		addToCache(accessor, prefix, suffix, completionText);
		const firstRes = await requestGhostText();
		assert.strictEqual(firstRes.type, 'success');
		assert.strictEqual(firstRes.value[0][0].completion.completionText, completionText);

		// Request a second completion typing into a non-multiline context:
		// the addition of `\tfmt.` to the current line changes the completion
		// context (via the `isEmptyBlockStart` computed in prompt/) from
		// multiline to single line.
		const secondText = 'import "fmt"\n\nfunc fizzbuzz(n int) {\n\tfmt.\n}\n';
		const second = createCompletionState(
			createTextDocument('file:///fizzbuzz.go', 'go', 1, secondText),
			LocationFactory.position(3, 9)
		);
		const secondRes = await requestGhostText(second);

		assert.strictEqual(secondRes.type, 'success');
		assert.strictEqual(secondRes.value[0][0].completion.completionText, 'Println("hi")\n\tfmt.Print("hello")');
		assert.strictEqual(secondRes.value[1], ResultType.TypingAsSuggested);
	});

	test('trims multiline async completion into single line context', async function () {
		const { accessor, doc, position, requestGhostText, requestPrompt } = setupCompletion(new NoFetchFetcher());
		const asyncManager = accessor.get(ICompletionsAsyncManagerService);
		const prompt = await requestPrompt();
		const [prefix] = trimLastLine(doc.getText(LocationFactory.range(LocationFactory.position(0, 0), position)));
		const response = fakeResult('\tfmt.Println("hi")\n\tfmt.Print("hello")');
		void asyncManager.queueCompletionRequest('0', prefix, prompt, new CancellationTokenSource(), response);

		// Request a single completion by typing into a non-multiline context:
		// the addition of `\tfmt.` to the current line changes the completion
		// context (via the `isEmptyBlockStart` computed in prompt/) from
		// multiline to single line.
		const secondText = 'import "fmt"\n\nfunc fizzbuzz(n int) {\n\tfmt.\n}\n';
		const second = createCompletionState(
			createTextDocument('file:///fizzbuzz.go', 'go', 1, secondText),
			LocationFactory.position(3, 9)
		);
		const secondRes = await requestGhostText(second);

		assert.strictEqual(secondRes.type, 'success');
		assert.strictEqual(secondRes.value[0][0].completion.completionText, 'Println("hi")');
		assert.strictEqual(secondRes.value[1], ResultType.Async);
	});

	test('returns cached single-line completion that starts with newline', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(
			new NoFetchFetcher(),
			'import "fmt"\n\nfunc fizzbuzz(n int) {\n\ti := 0\n}\n',
			LocationFactory.position(3, '\ti := 0'.length)
		);
		const { suffix } = await requestPrompt();
		const completionText = '\n\tj := 0';
		addToCache(accessor, prefix, suffix, completionText);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, completionText);
		assert.strictEqual(responseWithTelemetry.value[1], ResultType.Cache, 'result type should be cache');
	});

	test('returns prefixed cached completion', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(new NoFetchFetcher());
		const { suffix } = await requestPrompt();
		const earlierPrefix = prefix.substring(0, prefix.length - 3);
		const remainingPrefix = prefix.substring(prefix.length - 3);
		const completionText = '\tfor i := 1; i<= n; i++ {';
		addToCache(accessor, earlierPrefix, suffix, remainingPrefix + completionText);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, completionText);
		assert.strictEqual(responseWithTelemetry.value[1], ResultType.Cache, 'result type should be cache');
		assert.strictEqual(responseWithTelemetry.telemetryBlob.measurements.foundOffset, 3);
	});

	test('does not return cached completion when exhausted', async function () {
		const networkCompletionText = '\tfor i := 1; i<= n; i++ {';
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(
			new StaticFetcher(() => {
				return createFakeCompletionResponse(networkCompletionText);
			})
		);
		const { suffix } = await requestPrompt();
		const earlierPrefix = prefix.substring(0, prefix.length - 3);
		const remainingPrefix = prefix.substring(prefix.length - 3);
		addToCache(accessor, earlierPrefix, suffix, remainingPrefix);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, networkCompletionText);
		assert.strictEqual(responseWithTelemetry.value[1], ResultType.Async, 'result type should be async');
	});

	test('Multiline requests return multiple completions on second invocation', async function () {
		const firstCompletionText = '\tfirstVar := 1\n';
		const secondCompletionText = '\tfirstVar := 2\t';
		const completions = [firstCompletionText, secondCompletionText];
		let serverSentResponse = false;
		const { requestGhostText } = setupCompletion(
			new StaticFetcher((url, options) => {
				if (serverSentResponse) {
					throw new Error('Unexpected second request');
				}
				serverSentResponse = true;
				return createFakeCompletionResponse(completions);
			})
		);
		// Get the completion from the server, do the processing of the responses
		// this is a multiline request, so it'll request multiple completions, but whatever our cycling specification, it'll not _wait_ for those, c.f isCyclingRequest in getGhostTextStrategy.
		const firstResponse = await requestGhostText();
		assert.strictEqual(firstResponse.type, 'success');
		assert.strictEqual(firstResponse.value[0].length, 1);
		assert.strictEqual(firstResponse.value[0][0].completion.completionText, firstCompletionText.trimEnd());
		// therefore, request the same prompt again, this time with cycling specified, to get all completions from the cache
		const secondResponse = await requestGhostText();
		assert.strictEqual(secondResponse.type, 'success');
		// two completion results returned
		assert.strictEqual(secondResponse.value[0].length, 2);
		// the second one is the second completion, but with whitespace trimmed
		assert.strictEqual(secondResponse.value[0][0].completion.completionText, firstCompletionText.trimEnd());
		assert.strictEqual(secondResponse.value[0][1].completion.completionText, secondCompletionText.trimEnd());
	});

	test('Responses with duplicate content (modulo whitespace) are deduplicated', async function () {
		const firstCompletionText = '\tfirstVar := 1\n';
		const secondCompletionText = '\tfirstVar := 1\t';
		const completions = [firstCompletionText, secondCompletionText];
		let serverSentResponse = false;
		const { requestGhostText } = setupCompletion(
			new StaticFetcher((url, options) => {
				if (serverSentResponse) {
					throw new Error('Unexpected second request');
				}
				serverSentResponse = true;
				return createFakeCompletionResponse(completions);
			})
		);
		// Get the completion from the server, do the processing of the responses
		// this is a multiline request, so it'll request multiple completions, but whatever our cycling specification, it'll not _wait_ for those, c.f isCyclingRequest in getGhostTextStrategy.
		const firstResponse = await requestGhostText();
		assert.strictEqual(firstResponse.type, 'success');
		assert.strictEqual(firstResponse.value[0].length, 1);
		assert.strictEqual(firstResponse.value[0][0].completion.completionText, firstCompletionText.trimEnd());
		// therefore, request the same prompt again, this time with cycling specified, to get all completions from the cache
		const secondResponse = await requestGhostText();
		assert.strictEqual(secondResponse.type, 'success');
		// still only one completion result returned
		assert.strictEqual(secondResponse.value[0].length, 1);
		assert.strictEqual(secondResponse.value[0][0].completion.completionText, firstCompletionText.trimEnd());
	});

	test('adds prompt metadata to telemetry', async function () {
		const networkCompletionText = '\tfor i := 1; i<= n; i++ {';
		const { accessor, requestGhostText } = setupCompletion(
			new StaticFetcher(() => {
				return createFakeCompletionResponse(networkCompletionText);
			})
		);

		const { result, reporter } = await withInMemoryTelemetry(accessor, async () => {
			return await requestGhostText();
		});

		// The returned object (used for all other telemetry events) does not have the prompt metadata
		assert.deepStrictEqual(result.type, 'success');
		assert.ok(!result.telemetryBlob.properties.promptMetadata);

		// Only the issued event has it
		const issuedTelemetry = reporter.eventByName('ghostText.issued');
		assert.ok(issuedTelemetry.properties.promptMetadata);

		// Double check that the other events don't have it
		const events = reporter.events.filter(e => e.name !== 'ghostText.issued');
		assert.ok(events.length > 0);
		for (const event of events) {
			assert.ok(!event.properties.promptMetadata);
		}
	});

	test('cache hits use issuedTime in telemetry from current request, not cache', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(new NoFetchFetcher());
		const { suffix } = await requestPrompt();
		const completionText = '\tfor i := 1; i<= n; i++ {';
		const choice = fakeAPIChoiceFromCompletion(completionText);
		choice.telemetryData.issuedTime -= 100;
		addToCache(accessor, prefix, suffix, completionText);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(
			responseWithTelemetry.value[0][0].telemetry.issuedTime,
			responseWithTelemetry.telemetryBlob.issuedTime
		);
	});

	test('sends ghostText.issued telemetry event', async function () {
		const networkCompletionText = '\tfor i := 1; i<= n; i++ {';
		const { accessor, requestGhostText } = setupCompletion(
			new StaticFetcher(() => {
				return createFakeCompletionResponse(networkCompletionText);
			})
		);

		const { result, reporter } = await withInMemoryTelemetry(accessor, async () => {
			return await requestGhostText();
		});

		assert.strictEqual(result.type, 'success');
		const issuedTelemetry = reporter.eventByName('ghostText.issued');
		[
			'languageId',
			'beforeCursorWhitespace',
			'afterCursorWhitespace',
			'neighborSource',
			'gitRepoInformation',
			'engineName',
			'isMultiline',
			'blockMode',
			'isCycling',
		].forEach(prop => {
			assert.strictEqual(
				typeof issuedTelemetry.properties[prop],
				'string',
				`Expected telemetry property ${prop}`
			);
		});
		[
			'promptCharLen',
			'promptSuffixCharLen',
			'promptEndPos',
			'documentLength',
			'documentLineCount',
			'promptComputeTimeMs',
		].forEach(prop => {
			assert.strictEqual(
				typeof issuedTelemetry.measurements[prop],
				'number',
				`Expected telemetry measurement ${prop}`
			);
		});
	});

	test('excludes ghostText.issued-specific propeties in returned telemetry', async function () {
		const networkCompletionText = '\tfor i := 1; i<= n; i++ {';
		const { requestGhostText } = setupCompletion(
			new StaticFetcher(() => {
				return createFakeCompletionResponse(networkCompletionText);
			})
		);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		[
			'beforeCursorWhitespace',
			'afterCursorWhitespace',
			'promptChoices',
			'promptBackground',
			'neighborSource',
			'blockMode',
		].forEach(prop => {
			assert.strictEqual(
				responseWithTelemetry.value[0][0].telemetry.properties[prop],
				undefined,
				`Did not expect telemetry property ${prop}`
			);
			assert.strictEqual(
				responseWithTelemetry.telemetryBlob.properties[prop],
				undefined,
				`Did not expect telemetry property ${prop}`
			);
		});
		['promptCharLen', 'promptSuffixCharLen', 'promptCharLen', 'promptEndPos', 'promptComputeTimeMs'].forEach(
			prop => {
				assert.strictEqual(
					responseWithTelemetry.value[0][0].telemetry.measurements[prop],
					undefined,
					`Did not expect telemetry measurement ${prop}`
				);
				assert.strictEqual(
					responseWithTelemetry.telemetryBlob.measurements[prop],
					undefined,
					`Did not expect telemetry measurement ${prop}`
				);
			}
		);
	});

	test('includes document information in returned telemetry', async function () {
		const networkCompletionText = '\tfor i := 1; i<= n; i++ {';
		const { requestGhostText } = setupCompletion(
			new StaticFetcher(() => {
				return createFakeCompletionResponse(networkCompletionText);
			})
		);
		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		['languageId', 'gitRepoInformation', 'engineName', 'isMultiline', 'isCycling'].forEach(prop => {
			assert.strictEqual(
				typeof responseWithTelemetry.value[0][0].telemetry.properties[prop],
				'string',
				`Expected telemetry property ${prop}`
			);
			assert.strictEqual(
				typeof responseWithTelemetry.telemetryBlob.properties[prop],
				'string',
				`Expected telemetry property ${prop}`
			);
		});
	});

	test('updates transient document information in telemetry of cached choices', async function () {
		const { accessor, requestGhostText, requestPrompt, prefix } = setupCompletion(new NoFetchFetcher());
		const { suffix } = await requestPrompt();
		const completionText = '\tfor i := 1; i<= n; i++ {';
		addToCache(accessor, prefix, suffix, completionText);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		['documentLength', 'documentLineCount'].forEach(prop => {
			assert.strictEqual(
				typeof responseWithTelemetry.telemetryBlob.measurements[prop],
				'number',
				`Expected telemetry measurement ${prop}`
			);
			assert.strictEqual(
				responseWithTelemetry.value[0][0].telemetry.measurements[prop],
				responseWithTelemetry.telemetryBlob.measurements[prop],
				`Expected telemetry measurement ${prop} to be ${responseWithTelemetry.telemetryBlob.measurements[prop]}`
			);
		});
	});

	test('cancels if token is canceled', async function () {
		const tokenSource = new CancellationTokenSource();
		const deferredResponse = new Deferred<Response>();
		const { requestGhostText } = setupCompletion(
			new StaticFetcher(() => deferredResponse.promise),
			undefined,
			undefined,
			undefined,
			tokenSource.token
		);

		const requestPromise = requestGhostText();
		tokenSource.cancel();
		deferredResponse.resolve(createFakeCompletionResponse('var i int'));
		const result = await requestPromise;

		assert.strictEqual(result.type, 'abortedBeforeIssued');
		assert.strictEqual(result.reason, 'cancelled before extractPrompt');
	});

	test('cancels if a newer completion request is made', async function () {
		const firstResponseDeferred = new Deferred<Response>();
		const secondResponseDeferred = new Deferred<Response>();
		const deferreds = [firstResponseDeferred, secondResponseDeferred];
		const { requestGhostText } = setupCompletion(new StaticFetcher(() => deferreds.shift()!.promise));

		const firstResponsePromise = requestGhostText();
		const secondResponsePromise = requestGhostText();
		firstResponseDeferred.resolve(createFakeCompletionResponse('var i int'));
		secondResponseDeferred.resolve(createFakeCompletionResponse('var j int'));
		const firstResponse = await firstResponsePromise;
		const secondResponse = await secondResponsePromise;

		assert.strictEqual(firstResponse.type, 'abortedBeforeIssued');
		assert.strictEqual(firstResponse.reason, 'cancelled before extractPrompt');
		assert.strictEqual(secondResponse.type, 'success');
	});

	test('can close an unclosed brace (when using progressive reveal)', async function () {
		const { accessor, requestGhostText } = setupCompletion(
			new StaticFetcher(() => createFakeCompletionResponse('    }\n')),
			dedent`
				function hello(n: number) {
					for (let i = 1; i<= n; i++) {
						console.log("hello")

				}
			`,
			LocationFactory.position(3, 0),
			'typescript'
		);
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.AlwaysRequestMultiline, true);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 1);
		assert.strictEqual(responseWithTelemetry.value[0][0].completion.completionText, '    }');
	});

	test('filters out a duplicate brace (when using progressive reveal)', async function () {
		const { accessor, requestGhostText } = setupCompletion(
			new StaticFetcher(() => createFakeCompletionResponse('}\n')),
			dedent`
				function hello(n: number) {
					for (let i = 1; i<= n; i++) {
						console.log("hello")
					}

				}
			`,
			LocationFactory.position(4, 0),
			'typescript'
		);
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.AlwaysRequestMultiline, true);

		const responseWithTelemetry = await requestGhostText();

		assert.strictEqual(responseWithTelemetry.type, 'success');
		assert.strictEqual(responseWithTelemetry.value[0].length, 0);
	});

	test('progressive reveal uses a speculative request for multiline completions and caches further completions', async function () {
		const raw = dedent`
				switch {
				case n%3 == 0:
					output += "Fizz"
					fallthrough
				case n%5 == 0:
					output += "Buzz"
				default:
					output = fmt.Sprintf("%d", n)
				}
				fmt.Println(output)
			`;
		const lines = raw.split('\n').map(line => `    ${line}`);
		const multilineCompletion = lines.join('\n');
		const { accessor, doc, position, state } = setupCompletion(
			new StaticFetcher(() => createFakeCompletionResponse(multilineCompletion))
		);
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		const currentGhostText = accessor.get(ICompletionsCurrentGhostText);
		configProvider.setConfig(ConfigKey.AlwaysRequestMultiline, true);
		currentGhostText.hasAcceptedCurrentCompletion = () => true;

		const telemetryBuilder = new LlmNESTelemetryBuilder(undefined, undefined, undefined, 'ghostText', undefined);
		const logService = accessor.get(ILogService);
		const response = await getGhostText(accessor, state, undefined, { isSpeculative: true }, new GhostTextLogContext('file:///fizzbuzz.go', doc.version, undefined), telemetryBuilder, logService);

		assert.strictEqual(response.type, 'success');
		assert.strictEqual(response.value[0].length, 1);
		assert.strictEqual(response.value[0][0].completion.completionText, lines.slice(0, 9).join('\n'));

		const { result } = await acceptAndRequestNextCompletion(accessor, doc, position, response.value[0][0].completion);

		assert.strictEqual(result.type, 'success');
		assert.strictEqual(result.value[0].length, 1);
		assert.strictEqual(result.value[0][0].completion.completionText, '\n' + lines.slice(9).join('\n'));
		assert.strictEqual(result.resultType, ResultType.Cache);
	});
});

function fakeResult(completionText: string): Promise<GetNetworkCompletionsType> {
	const telemetryBlob = TelemetryWithExp.createEmptyConfigForTesting();
	return Promise.resolve({
		type: 'success',
		value: [fakeAPIChoice(generateUuid(), 0, completionText), Promise.resolve()],
		telemetryData: mkBasicResultTelemetry(telemetryBlob),
		telemetryBlob,
		resultType: ResultType.Async,
	});
}
