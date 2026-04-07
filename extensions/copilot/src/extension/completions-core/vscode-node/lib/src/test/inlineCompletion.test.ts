/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import Sinon from 'sinon';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import { SyncDescriptor } from '../../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { LlmNESTelemetryBuilder } from '../../../../../inlineEdits/node/nextEditProviderTelemetry';
import { GhostTextLogContext } from '../../../../common/ghostTextContext';
import { ResultType } from '../ghostText/resultType';
import { telemetryShown } from '../ghostText/telemetry';
import { GhostText } from '../inlineCompletion';
import { FetchOptions, ICompletionsFetcherService, Response } from '../networking';
import { CompletionRequest, ICompletionsOpenAIFetcherService, LiveOpenAIFetcher } from '../openai/fetch';
import { LocationFactory } from '../textDocument';
import { Deferred, delay } from '../util/async';
import { createLibTestingContext } from './context';
import { createFakeCompletionResponse, StaticFetcher } from './fetcher';
import { withInMemoryTelemetry } from './telemetry';
import { createTextDocument } from './textDocument';
import { ILogService } from '../../../../../../platform/log/common/logService';

suite('getInlineCompletions()', function () {
	function setupCompletion(
		fetcher: ICompletionsFetcherService,
		docText = 'function example() {\n\n}',
		position = LocationFactory.position(1, 0),
		languageId = 'typescript'
	) {
		const serviceCollection = createLibTestingContext();
		const doc = createTextDocument('file:///example.ts', languageId, 1, docText);
		serviceCollection.define(ICompletionsFetcherService, fetcher);
		serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher)); // gets results from static fetcher
		const accessor = serviceCollection.createTestingAccessor();

		// Setup closures with the state as default
		function requestInlineCompletions(textDoc = doc, pos = position) {
			const instaService = accessor.get(IInstantiationService);
			const ghostText = instaService.createInstance(GhostText);
			const telemetryBuilder = new LlmNESTelemetryBuilder(undefined, undefined, undefined, 'ghostText', undefined);
			const logService = accessor.get(ILogService);
			return ghostText.getInlineCompletions(textDoc, pos, CancellationToken.None, undefined, new GhostTextLogContext(textDoc.uri, textDoc.version, undefined), telemetryBuilder, logService);
		}

		return {
			accessor,
			doc,
			position,
			requestInlineCompletions,
		};
	}

	test('Sends a speculative request when shown', async function () {
		const firstCompletionText = '\tconst firstVar = 1;';
		const secondCompletionText = '\tconst secondVar = 2;';

		const completionsDeferred = new Deferred<CompletionRequest>();
		const networkResponse = Sinon.stub<[string, FetchOptions], Response>().returns(
			createFakeCompletionResponse('// not expected!')
		);
		networkResponse.onFirstCall().returns(createFakeCompletionResponse(firstCompletionText));
		networkResponse.onSecondCall().callsFake((_url, opts) => {
			completionsDeferred.resolve(opts.json as CompletionRequest);
			return createFakeCompletionResponse(secondCompletionText);
		});
		const { accessor, doc, position, requestInlineCompletions } = setupCompletion(new StaticFetcher(networkResponse));

		const { reporter, result } = await withInMemoryTelemetry(accessor, async () => {
			const firstResponse = await requestInlineCompletions();

			assert.strictEqual(firstResponse?.length, 1);
			assert.strictEqual(firstResponse[0].insertText, firstCompletionText);
			telemetryShown(accessor, firstResponse[0]);

			// We're expecting 2 completion requests: one we explicitly requested, and a follow-up speculative request in the background.
			return await completionsDeferred.promise;
		});

		const expectedPrefix = doc.getText({ start: { line: 0, character: 0 }, end: position }) + firstCompletionText;
		assert.ok(result.prompt.endsWith(expectedPrefix), 'Expect first completion in second request');

		const issuedTelemetry = reporter.eventsMatching(event => event.name === 'ghostText.issued');
		assert.strictEqual(issuedTelemetry.length, 2, `Expected 2 issued events, got ${issuedTelemetry.length}`);

		const speculativeTelemetry = reporter.eventsMatching(
			event => event.name === 'ghostText.issued' && event.properties['reason'] === 'speculative'
		);
		assert.ok(speculativeTelemetry.length === 1, 'Expected one speculative request');
	});

	test('speculative requests apply completions the same as the editor and CLS', async function () {
		const firstCompletion = '    const firstVar = 1;';
		const secondCompletion = '\n    const secondVar = 2;';
		const completionsDeferred = new Deferred<void>();
		const networkResponse = Sinon.stub<[], Response>().returns(createFakeCompletionResponse('// not expected!'));
		networkResponse.onFirstCall().returns(createFakeCompletionResponse(firstCompletion));
		networkResponse.onSecondCall().callsFake(() => {
			completionsDeferred.resolve();
			return createFakeCompletionResponse(secondCompletion);
		});
		const { accessor, doc, position, requestInlineCompletions } = setupCompletion(
			new StaticFetcher(networkResponse),
			'function example() {\n    \n}\n',
			LocationFactory.position(1, 4)
		);

		const response = await requestInlineCompletions();

		assert.strictEqual(response?.length, 1);
		assert.strictEqual(response[0].insertText, firstCompletion);
		assert.deepStrictEqual(response[0].range, LocationFactory.range(LocationFactory.position(1, 0), position));

		telemetryShown(accessor, response[0]);
		await completionsDeferred.promise; // Wait for speculative request to be sent

		const docv2 = createTextDocument(
			doc.uri,
			doc.clientLanguageId,
			doc.version + 1,
			`function example() {\n${firstCompletion}\n}\n`
		);
		const position2 = LocationFactory.position(1, firstCompletion.length);
		const response2 = await requestInlineCompletions(docv2, position2);

		assert.strictEqual(response2?.length, 1);
		assert.strictEqual(response2[0].insertText, firstCompletion + secondCompletion);
		assert.deepStrictEqual(
			response2[0].range,
			LocationFactory.range(LocationFactory.position(1, 0), LocationFactory.position(1, firstCompletion.length))
		);
		assert.strictEqual(response2[0].resultType, ResultType.Cache);
		assert.strictEqual(networkResponse.callCount, 2);
	});

	test('does not send a speculative request if empty', async function () {
		const { accessor, requestInlineCompletions } = setupCompletion(
			new StaticFetcher(() => createFakeCompletionResponse(''))
		);

		const { reporter, result } = await withInMemoryTelemetry(accessor, () => {
			return requestInlineCompletions();
		});

		assert.strictEqual(result, undefined);
		const issuedTelemetry = reporter.eventsMatching(event => event.name === 'ghostText.issued');
		assert.strictEqual(issuedTelemetry.length, 1, `Expected 1 issued events, got ${issuedTelemetry.length}`);
		const speculativeTelemetry = reporter.eventsMatching(
			event => event.name === 'ghostText.issued' && event.properties['reason'] === 'speculative'
		);
		assert.ok(speculativeTelemetry.length === 0, 'Expected no speculative request');
	});

	test('telemetryShown triggers speculative request only when shown', async function () {
		const firstCompletionText = '\tconst firstVar = 1;';
		const secondCompletionText = '\tconst secondVar = 2;';
		const completionsDeferred = new Deferred<CompletionRequest>();
		const networkResponse = Sinon.stub<[string, FetchOptions], Response>().returns(
			createFakeCompletionResponse('// not expected!')
		);
		networkResponse.onFirstCall().returns(createFakeCompletionResponse(firstCompletionText));
		networkResponse.onSecondCall().callsFake((_url, opts) => {
			completionsDeferred.resolve(opts.json as CompletionRequest);
			return createFakeCompletionResponse(secondCompletionText);
		});

		const { accessor, requestInlineCompletions } = setupCompletion(new StaticFetcher(networkResponse));

		const { reporter } = await withInMemoryTelemetry(accessor, async () => {
			const firstResponse = await requestInlineCompletions();
			assert.strictEqual(firstResponse?.length, 1);
			assert.strictEqual(firstResponse[0].insertText, firstCompletionText);

			// Verify speculative request is not made before shown
			await delay(50);
			assert.strictEqual(networkResponse.callCount, 1, 'Expected only the initial network call');

			// Call telemetryShown to trigger speculative request
			telemetryShown(accessor, firstResponse[0]);

			// Wait for speculative request to complete
			return await completionsDeferred.promise;
		});

		assert.strictEqual(networkResponse.callCount, 2, 'Expected 2 network calls (original + speculative)');
		const shownTelemetry = reporter.eventsMatching(event => event.name === 'ghostText.shown');
		assert.strictEqual(shownTelemetry.length, 1, 'Expected one shown telemetry event');
		const speculativeTelemetry = reporter.eventsMatching(
			event => event.name === 'ghostText.issued' && event.properties['reason'] === 'speculative'
		);
		assert.ok(speculativeTelemetry.length === 1, 'Expected one speculative request');
	});
});
