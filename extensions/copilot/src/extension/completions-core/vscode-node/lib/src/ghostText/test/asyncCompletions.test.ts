/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'node:assert';
import sinon from 'sinon';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from '../../../../types/src';
import { ICompletionsFeaturesService } from '../../experiments/featuresService';
import { fakeAPIChoice } from '../../openai/fetch.fake';
import { APIChoice } from '../../openai/openai';
import { Prompt } from '../../prompt/prompt';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { delay } from '../../util/async';
import { ResultType } from '../resultType';
import { AsyncCompletionManager } from './../asyncCompletions';
import { GhostTextResultWithTelemetry, mkBasicResultTelemetry } from './../telemetry';

suite('AsyncCompletionManager', function () {
	let accessor: ServicesAccessor;
	let manager: AsyncCompletionManager;
	let clock: sinon.SinonFakeTimers;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
		manager = accessor.get(IInstantiationService).createInstance(AsyncCompletionManager);
		clock = sinon.useFakeTimers();
	});

	teardown(function () {
		clock.restore();
	});

	suite('shouldWaitForAsyncCompletions', function () {
		test('is false when there are no requests', function () {
			const prefix = 'func main() {\n';
			const prompt = createPrompt(prefix, '}\n');
			const shouldQueue = manager.shouldWaitForAsyncCompletions(prefix, prompt);
			assert.strictEqual(shouldQueue, false);
		});

		test('is false when there are no matching requests', async function () {
			void manager.queueCompletionRequest('0', 'import (', createPrompt(), CTS(), pendingResult()); // Prefix doesn't match
			void manager.queueCompletionRequest('1', 'func main() {\n', createPrompt('', '\t'), CTS(), pendingResult()); // Suffix doesn't match
			await manager.queueCompletionRequest('2', 'package ', createPrompt(), CTS(), fakeResult('main')); // Prefix doesn't match completed
			await manager.queueCompletionRequest('3', 'func ', createPrompt(), CTS(), fakeResult('test')); // Completion doesn't match prefix
			void manager.queueCompletionRequest('4', 'func ', createPrompt(), CTS(), pendingResult()); // Partial completion doesn't match prefix
			manager.updateCompletion('4', 'func test');

			assert.strictEqual(manager.shouldWaitForAsyncCompletions('func main() {\n', createPrompt()), false);
		});

		test('is true when there is a matching pending request', function () {
			const prefix = 'func main() {\n';
			const prompt = createPrompt(prefix, '}\n');
			void manager.queueCompletionRequest('0', prefix, prompt, CTS(), pendingResult());

			assert.strictEqual(manager.shouldWaitForAsyncCompletions(prefix, prompt), true);
		});

		test('is true when there is a matching completed request', async function () {
			const prefix = 'func main() {\n';
			const prompt = createPrompt(prefix, '}\n');
			const promise = fakeResult('\tfmt.Println("Hello, world!")');
			await manager.queueCompletionRequest('0', prefix, prompt, CTS(), promise);

			assert.strictEqual(manager.shouldWaitForAsyncCompletions(prefix, prompt), true);
		});

		test('is true when there is a completed request with a prefixing prompt and matching completion', async function () {
			const earlierPrefix = 'func main() {\n';
			const earlierPrompt = createPrompt(earlierPrefix, '}\n');
			const promise = fakeResult('\tfmt.Println("Hello, world!")');
			await manager.queueCompletionRequest('0', earlierPrefix, earlierPrompt, CTS(), promise);

			const prefix = 'func main() {\n\tfmt.';
			const prompt = createPrompt(prefix, '}\n');
			assert.strictEqual(manager.shouldWaitForAsyncCompletions(prefix, prompt), true);
		});

		test('is true when there is a pending request with a prefixing prompt and matching partial result', function () {
			const earlierPrefix = 'func main() {\n';
			const earlierPrompt = createPrompt(earlierPrefix, '}\n');
			void manager.queueCompletionRequest('0', earlierPrefix, earlierPrompt, CTS(), pendingResult());
			manager.updateCompletion('0', '\tfmt.Println');

			const prefix = 'func main() {\n\tfmt.';
			const prompt = createPrompt(prefix, '}\n');
			assert.strictEqual(manager.shouldWaitForAsyncCompletions(prefix, prompt), true);
		});
	});

	suite('getFirstMatchingRequest', function () {
		test('returns undefined when there are no matching choices', async function () {
			void manager.queueCompletionRequest('0', 'import (', createPrompt(), CTS(), pendingResult()); // Prefix doesn't match
			void manager.queueCompletionRequest('1', 'func main() {\n', createPrompt('', '\t'), CTS(), pendingResult()); // Suffix doesn't match
			void manager.queueCompletionRequest('2', 'func ', createPrompt(), CTS(), fakeResult('test')); // Completion doesn't match prefix

			const choice = await manager.getFirstMatchingRequest('3', 'func main() {\n', createPrompt(), false);

			assert.strictEqual(choice, undefined);
		});

		test('does not return an empty choice', async function () {
			void manager.queueCompletionRequest('0', 'func ', createPrompt(), CTS(), fakeResult('main() {\n'));

			const choice = await manager.getFirstMatchingRequest('1', 'func mai(){ \n', createPrompt(), false);

			assert.strictEqual(choice, undefined);
		});

		test('returns the first resolved choice that matches', async function () {
			void manager.queueCompletionRequest(
				'0',
				'func ',
				createPrompt(),
				CTS(),
				fakeResult('main() {\n', r => delay(1, r))
			);
			void manager.queueCompletionRequest(
				'1',
				'func ',
				createPrompt(),
				CTS(),
				fakeResult('main() {\n\terr :=', r => delay(2000, r))
			);
			void manager.queueCompletionRequest(
				'2',
				'func ',
				createPrompt(),
				CTS(),
				fakeResult('main() {\n\tfmt.Println', r => delay(20, r))
			);

			const choicePromise = manager.getFirstMatchingRequest('3', 'func main() {\n', createPrompt(), false);
			await clock.runAllAsync();
			const choice = await choicePromise;

			assert.ok(choice);
			assert.strictEqual(choice[0].completionText, '\tfmt.Println');
			assert.strictEqual(choice[0].telemetryData.measurements.foundOffset, 9);
		});
	});

	suite('getFirstMatchingRequestWithTimeout', function () {
		test('returns result before timeout', async function () {
			void manager.queueCompletionRequest(
				'0',
				'fmt.',
				createPrompt(),
				CTS(),
				fakeResult('Println("Hi")', r => delay(1, r))
			);
			const featuresService = accessor.get(ICompletionsFeaturesService);
			featuresService.asyncCompletionsTimeout = () => 1000;

			const choicePromise = manager.getFirstMatchingRequestWithTimeout(
				'1',
				'fmt.',
				createPrompt(),
				false,
				TelemetryWithExp.createEmptyConfigForTesting()
			);
			await clock.runAllAsync();
			const choice = await choicePromise;

			assert.ok(choice);
			assert.strictEqual(choice[0].completionText, 'Println("Hi")');
		});

		test('returns undefined after timeout', async function () {
			void manager.queueCompletionRequest(
				'0',
				'fmt.',
				createPrompt(),
				CTS(),
				fakeResult('Println("Hello")', r => delay(2000, r))
			);
			const featuresService = accessor.get(ICompletionsFeaturesService);
			featuresService.asyncCompletionsTimeout = () => 10;

			const choicePromise = manager.getFirstMatchingRequestWithTimeout(
				'1',
				'fmt.',
				createPrompt(),
				false,
				TelemetryWithExp.createEmptyConfigForTesting()
			);
			await clock.runAllAsync();
			const choice = await choicePromise;

			assert.strictEqual(choice, undefined);
		});

		test('does not timeout if timeout is set to -1', async function () {
			void manager.queueCompletionRequest(
				'0',
				'fmt.',
				createPrompt(),
				CTS(),
				fakeResult('Println("Hi")', r => delay(100, r))
			);
			const featuresService = accessor.get(ICompletionsFeaturesService);
			featuresService.asyncCompletionsTimeout = () => -1;

			const choicePromise = manager.getFirstMatchingRequestWithTimeout(
				'1',
				'fmt.',
				createPrompt(),
				false,
				TelemetryWithExp.createEmptyConfigForTesting()
			);
			await clock.runAllAsync();
			const choice = await choicePromise;

			assert.ok(choice);
			assert.strictEqual(choice[0].completionText, 'Println("Hi")');
		});
	});

	suite('cancels', function () {
		test('pending requests that are no longer candidates for the most recent', function () {
			const firstToken = CTS();
			const secondToken = CTS();
			void manager.queueCompletionRequest('0', 'import (', createPrompt(), firstToken, pendingResult()); // Prefix doesn't match
			void manager.queueCompletionRequest('1', 'func ', createPrompt(), secondToken, pendingResult());
			manager.updateCompletion('1', 'test()'); // Partial completion doesn't match prefix

			void manager.getFirstMatchingRequest('2', 'func main() {\n', createPrompt(), false);

			assert.strictEqual(firstToken.token.isCancellationRequested, true);
			assert.strictEqual(secondToken.token.isCancellationRequested, true);
		});

		test('pending request after updating to no longer match', function () {
			const cts = CTS();
			void manager.queueCompletionRequest('1', 'func ', createPrompt(), cts, pendingResult());

			void manager.getFirstMatchingRequest('2', 'func main() {\n', createPrompt(), false);
			manager.updateCompletion('1', 'test()');

			assert.strictEqual(cts.token.isCancellationRequested, true);
		});

		test('only requests that do not match the most recent request', function () {
			const cts = CTS();
			void manager.queueCompletionRequest('1', 'func ', createPrompt(), cts, pendingResult());
			void manager.getFirstMatchingRequest('2', 'func main', createPrompt(), false);
			void manager.getFirstMatchingRequest('3', 'func test', createPrompt(), false);
			manager.updateCompletion('1', 'test()');

			assert.strictEqual(cts.token.isCancellationRequested, false);
		});

		test('only requests that do not match the most recent request excluding speculative requests', function () {
			const cts = CTS();
			void manager.queueCompletionRequest('1', 'func ', createPrompt(), cts, pendingResult());
			void manager.getFirstMatchingRequest('2', 'func main', createPrompt(), false);
			void manager.getFirstMatchingRequest('3', 'func test', createPrompt(), false);
			void manager.getFirstMatchingRequest('4', 'func main() {\nvar i;', createPrompt(), true);
			manager.updateCompletion('1', 'test()');

			assert.strictEqual(cts.token.isCancellationRequested, false);
		});

		test('all requests that do not match the most recent request', function () {
			const firstCTS = CTS();
			const secondCTS = CTS();
			const thirdCTS = CTS();
			void manager.queueCompletionRequest('0', 'func ', createPrompt(), firstCTS, pendingResult());
			void manager.queueCompletionRequest('1', 'func mai', createPrompt(), secondCTS, pendingResult());
			void manager.getFirstMatchingRequest('2', 'func main', createPrompt(), false);
			manager.updateCompletion('0', 'main');
			void manager.queueCompletionRequest('3', 'func t', createPrompt(), thirdCTS, pendingResult());
			void manager.getFirstMatchingRequest('4', 'func test', createPrompt(), false);
			manager.updateCompletion('3', 'rigger');

			assert.strictEqual(firstCTS.token.isCancellationRequested, true);
			assert.strictEqual(secondCTS.token.isCancellationRequested, true);
			assert.strictEqual(thirdCTS.token.isCancellationRequested, true);
		});
	});
});

function createPrompt(prefix = '', suffix = ''): Prompt {
	return { prefix, suffix, isFimEnabled: true };
}

type Result = GhostTextResultWithTelemetry<[APIChoice, Promise<void>]>;

function fakeResult(completionText: string, resolver = (r: Result) => Promise.resolve(r)): Promise<Result> {
	const telemetryBlob = TelemetryWithExp.createEmptyConfigForTesting();
	return resolver({
		type: 'success',
		value: [fakeAPIChoice(generateUuid(), 0, completionText), new Promise(() => { })],
		telemetryData: mkBasicResultTelemetry(telemetryBlob),
		telemetryBlob,
		resultType: ResultType.Async,
	});
}

function pendingResult(): Promise<Result> {
	return new Promise(() => { });
}

function CTS() {
	return new CancellationTokenSource();
}
