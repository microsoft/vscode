/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as Sinon from 'sinon';
import { Completions, ICompletionsFetchService } from '../../../../../../../platform/nesFetch/common/completionsFetchService';
import { CompletionsFetchService } from '../../../../../../../platform/nesFetch/node/completionsFetchServiceImpl';
import { ResponseStream } from '../../../../../../../platform/nesFetch/common/responseStream';
import { ICompletionModelInformation } from '../../../../../../../platform/endpoint/common/endpointProvider';
import { FetchOptions, HeadersImpl, Response } from '../../../../../../../platform/networking/common/fetcherService';
import { TestingServiceCollection } from '../../../../../../../platform/test/node/services';
import { TokenizerType } from '../../../../../../../util/common/tokenizer';
import { Result } from '../../../../../../../util/common/result';
import { CancellationToken } from '../../../../../../../util/vs/base/common/cancellation';
import { generateUuid } from '../../../../../../../util/vs/base/common/uuid';
import { SyncDescriptor } from '../../../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { CancellationTokenSource } from '../../../../types/src';
import { ICompletionsCopilotTokenManager } from '../../auth/copilotTokenManager';
import { ConfigKey, ICompletionsConfigProvider, InMemoryConfigProvider } from '../../config';
import { ICompletionsStatusReporter, StatusChangedEvent, StatusReporter } from '../../progress';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { withInMemoryTelemetry } from '../../test/telemetry';
import {
	CMDQuotaExceeded,
	CompletionParams,
	CopilotUiKind,
	ICompletionsOpenAIFetcherService,
	LiveOpenAIFetcher, sanitizeRequestOptionTelemetry
} from '../fetch';
import { SyntheticCompletions } from '../fetch.fake';
import { AvailableModelsManager, ICompletionsModelManagerService } from '../model';

suite('"Fetch" unit tests', function () {
	let accessor: ServicesAccessor;
	let serviceCollection: TestingServiceCollection;
	let resetSpy: Sinon.SinonSpy<Parameters<ICompletionsCopilotTokenManager['resetToken']>>;
	let mockFetchService: MockCompletionsFetchService;

	setup(function () {
		serviceCollection = createLibTestingContext();
		mockFetchService = new MockCompletionsFetchService();
		serviceCollection.define(ICompletionsFetchService, mockFetchService);
		serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher));
		accessor = serviceCollection.createTestingAccessor();
		resetSpy = Sinon.spy(accessor.get(ICompletionsCopilotTokenManager), 'resetToken');
	});

	test('Empty/whitespace completions are stripped', async function () {
		const fetcher = new SyntheticCompletions(['', ' ', '\n'], accessor.get(ICompletionsCopilotTokenManager));
		const params: CompletionParams = {
			prompt: {
				prefix: '',
				suffix: '',
				isFimEnabled: false,
			},
			languageId: '',
			repoInfo: undefined,
			engineModelId: '',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			ourRequestId: generateUuid(),
			extra: {},
		};
		const cancellationToken = new CancellationTokenSource().token;
		const res = await fetcher.fetchAndStreamCompletions(
			params,
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined,
			cancellationToken
		);
		assert.deepStrictEqual(res.type, 'success');
		// keep the type checker happy
		if (res.type !== 'success') {
			throw new Error(`internal error: res.type is not 'success'`);
		}
		const stream = res.choices;
		const results = [];
		for await (const result of stream) {
			results.push(result);
		}
		assert.strictEqual(results.length, 0);
	});

	test('If in the split context experiment, send the context field as part of the request', async function () {
		const recordingFetchService = new MockCompletionsFetchService();
		const params: CompletionParams = {
			prompt: {
				context: ['# Language: Python'],
				prefix: 'prefix without context',
				suffix: '\ndef sum(a, b):\n    return a + b',
				isFimEnabled: true,
			},
			languageId: 'python',
			repoInfo: undefined,
			engineModelId: 'copilot-codex',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			postOptions: {},
			ourRequestId: generateUuid(),
			extra: {},
		};

		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, recordingFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();

		const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
		telemetryWithExp.filtersAndExp.exp.variables.copilotenablepromptcontextproxyfield = true;

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		await openAIFetcher.fetchAndStreamCompletions(params, telemetryWithExp, () => undefined);

		const lastParams = recordingFetchService.lastParams;
		assert.strictEqual(lastParams?.prompt, params.prompt.prefix);
		assert.deepStrictEqual(lastParams?.extra?.context, params.prompt.context);
	});

	test('properly handles 466 (client outdated) responses from proxy', async function () {
		const statusReporter = new TestStatusReporter();
		const result = await assertResponseWithStatus(466, statusReporter);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'client not supported: response-text' });
		assert.deepStrictEqual(statusReporter.kind, 'Error');
		assert.deepStrictEqual(statusReporter.message, 'response-text');
		assert.deepStrictEqual(statusReporter.eventCount, 1);
	});

	test('has fallback for unknown http response codes from proxy', async function () {
		const statusReporter = new TestStatusReporter();
		const result = await assertResponseWithStatus(518, statusReporter);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'unhandled status from server: 518 response-text' });
		assert.deepStrictEqual(statusReporter.kind, 'Warning');
		assert.deepStrictEqual(statusReporter.message, 'Last response was a 518 error');
	});

	test('calls out possible proxy for 4xx requests without x-github-request-id', async function () {
		const statusReporter = new TestStatusReporter();
		const result = await assertResponseWithStatus(418, statusReporter, { 'x-github-request-id': '' });

		assert.deepStrictEqual(result, { type: 'failed', reason: 'unhandled status from server: 418 response-text' });
		assert.deepStrictEqual(statusReporter.kind, 'Warning');
		assert.deepStrictEqual(
			statusReporter.message,
			'Last response was a 418 error and does not appear to originate from GitHub. Is a proxy or firewall intercepting this request? https://gh.io/copilot-firewall'
		);
	});

	test('HTTP `Unauthorized` invalidates token', async function () {
		const result = await assertResponseWithContext(accessor, 401);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'token expired or invalid: 401' });
		assert.ok(resetSpy.calledOnce, 'resetToken should have been called once');
	});

	test('HTTP `Forbidden` invalidates token', async function () {
		const result = await assertResponseWithContext(accessor, 403);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'token expired or invalid: 403' });
		assert.ok(resetSpy.calledOnce, 'resetToken should have been called once');
	});

	test('HTTP `Too many requests` enforces rate limiting locally', async function () {
		const mockFetch = new MockCompletionsFetchService();
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsFetchService, mockFetch);
		serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher));
		const accessor = serviceCollection.createTestingAccessor();
		const result = await assertResponseWithContext(accessor, 429);
		const fetcherService = accessor.get(ICompletionsOpenAIFetcherService);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'rate limited' });
		const limited = await fetcherService.fetchAndStreamCompletions(
			{} as CompletionParams,
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => Promise.reject(new Error()),
			new CancellationTokenSource().token
		);
		assert.deepStrictEqual(limited, { type: 'canceled', reason: 'rate limited' });
	});

	test.skip('properly handles 402 (free plan exhausted) responses from proxy', async function () {
		const fetcherService = accessor.get(ICompletionsOpenAIFetcherService);
		const tokenManager = accessor.get(ICompletionsCopilotTokenManager);
		await tokenManager.primeToken(); // Trigger initial status
		const statusReporter = new TestStatusReporter();

		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsStatusReporter, statusReporter);
		const accessorClone = serviceCollectionClone.createTestingAccessor();
		const result = await assertResponseWithContext(accessorClone, 402);

		assert.deepStrictEqual(result, { type: 'failed', reason: 'monthly free code completions exhausted' });
		assert.deepStrictEqual(statusReporter.kind, 'Error');
		assert.match(statusReporter.message, /limit/);
		assert.deepStrictEqual(statusReporter.eventCount, 1);
		assert.deepStrictEqual(statusReporter.command, CMDQuotaExceeded);
		const exhausted = await fetcherService.fetchAndStreamCompletions(
			fakeCompletionParams(),
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => Promise.reject(new Error()),
			new CancellationTokenSource().token
		);
		assert.deepStrictEqual(exhausted, { type: 'canceled', reason: 'monthly free code completions exhausted' });

		tokenManager.resetToken();
		await tokenManager.getToken();

		const refreshed = await assertResponseWithContext(accessorClone, 429);
		assert.deepStrictEqual(refreshed, { type: 'failed', reason: 'rate limited' });
		assert.deepStrictEqual(statusReporter.kind, 'Error');
	});

	test('additional headers are included in the request', async function () {
		const recordingFetchService = new MockCompletionsFetchService();
		const params: CompletionParams = {
			prompt: {
				prefix: '',
				suffix: '',
				isFimEnabled: false,
			},
			languageId: '',
			repoInfo: undefined,
			engineModelId: 'copilot-codex',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			ourRequestId: generateUuid(),
			headers: { Host: 'bla' },
			extra: {},
		};
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, recordingFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		await openAIFetcher.fetchAndStreamCompletions(
			params,
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined
		);

		assert.strictEqual(recordingFetchService.lastHeaders?.['Host'], 'bla');
	});

	test('custom completion models route to the configured endpoint without Copilot bearer auth', async function () {
		const recordingFetchService = new MockCompletionsFetchService();
		const params: CompletionParams = {
			prompt: {
				prefix: 'function add(a, b) {',
				suffix: '\n}',
				isFimEnabled: true,
			},
			languageId: 'javascript',
			repoInfo: undefined,
			engineModelId: 'local-gemma',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			ourRequestId: generateUuid(),
			extra: {},
		};
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, recordingFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-gemma',
			model: 'gemma-4-e4b-it-qat',
			url: 'http://127.0.0.1:8080',
			requestHeaders: {
				'X-Local-Model': '1',
			},
		}]);

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		await openAIFetcher.fetchAndStreamCompletions(
			params,
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined
		);

		assert.strictEqual(recordingFetchService.lastUrl, 'http://127.0.0.1:8080/v1/completions');
		assert.strictEqual(recordingFetchService.lastSecretKey, undefined);
		assert.strictEqual(recordingFetchService.lastParams?.model, 'gemma-4-e4b-it-qat');
		assert.strictEqual(recordingFetchService.lastHeaders?.['X-Local-Model'], '1');
		assert.strictEqual(recordingFetchService.lastHeaders?.['Openai-Organization'], undefined);
	});

	test('custom completion model auth errors do not reset Copilot token', async function () {
		const mockFetchService = new MockCompletionsFetchService();
		mockFetchService.nextResult = Result.error(new Completions.UnsuccessfulResponse(
			401,
			'status text',
			new HeadersImpl({
				'x-request-id': 'custom-request-id',
				'x-github-request-id': 'custom-github-request-id',
				'X-Copilot-Experiment': 'custom-experiment',
				'x-copilot-api-exp-assignment-context': 'custom-assignment',
				'azureml-model-deployment': 'custom-deployment',
			}),
			() => Promise.resolve('missing local key')
		));
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, mockFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
		}]);
		resetSpy.resetHistory();
		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);

		const { reporter, result } = await withInMemoryTelemetry(accessor, () => openAIFetcher.fetchAndStreamCompletions(
			{
				prompt: {
					prefix: 'const value = ',
					suffix: ';',
					isFimEnabled: true,
				},
				languageId: 'typescript',
				repoInfo: undefined,
				engineModelId: 'local-gemma',
				count: 1,
				uiKind: CopilotUiKind.GhostText,
				ourRequestId: generateUuid(),
				extra: {},
			},
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined
		));

		assert.deepStrictEqual(result, { type: 'failed', reason: 'custom completion endpoint returned 401' });
		assert.strictEqual(resetSpy.called, false);
		const telemetryJson = JSON.stringify(reporter.events);
		assert.strictEqual(telemetryJson.includes('missing local key'), false);
		assert.strictEqual(telemetryJson.includes('custom completion endpoint returned 401'), true);
		assert.strictEqual(telemetryJson.includes('custom-request-id'), false);
		assert.strictEqual(telemetryJson.includes('custom-github-request-id'), false);
		assert.strictEqual(telemetryJson.includes('custom-experiment'), false);
		assert.strictEqual(telemetryJson.includes('custom-assignment'), false);
		assert.strictEqual(telemetryJson.includes('custom-deployment'), false);
	});

	test('custom completion success responses do not propagate custom endpoint request IDs', async function () {
		const maliciousHeaders = new HeadersImpl({
			'x-request-id': 'custom-request-id',
			'x-github-request-id': 'custom-github-request-id',
			'X-Copilot-Experiment': 'custom-experiment',
			'x-copilot-api-exp-assignment-context': 'custom-assignment',
			'azureml-model-deployment': 'custom-deployment',
		});
		const responseBody = `data: ${JSON.stringify({
			choices: [{
				index: 0,
				finish_reason: 'stop',
				logprobs: null,
				text: ' completion',
			}],
			system_fingerprint: 'custom-system',
			object: 'text_completion',
		})}\n\ndata: [DONE]\n\n`;
		const fetcherService = {
			fetch: async (_url: string, _options: FetchOptions) => Response.fromText(200, 'OK', maliciousHeaders, responseBody, 'test-stub'),
			makeAbortController: () => {
				const abortController = new AbortController();
				return {
					signal: abortController.signal,
					abort: () => abortController.abort(),
				};
			},
			disconnectAll: async () => undefined,
		};
		const completionsFetchService = new CompletionsFetchService(
			{} as any,
			fetcherService as any,
			{ addEntry() { } } as any,
		);

		const result = await completionsFetchService.fetch(
			'http://127.0.0.1:8080/v1/completions',
			undefined,
			{
				prompt: 'const value = ',
				suffix: ';',
				stream: true,
				max_tokens: 16,
				n: 1,
				temperature: 0,
				top_p: 1,
				stop: [],
				extra: {},
			},
			generateUuid(),
			CancellationToken.None,
		);

		assert.strictEqual(result.isOk(), true);
		if (result.isError()) {
			throw new Error('expected custom completion request to succeed');
		}
		assert.deepStrictEqual(result.val.requestId, {
			headerRequestId: '',
			gitHubRequestId: '',
			completionId: '',
			created: 0,
			serverExperiments: '',
			deploymentId: '',
		});

		const choices = LiveOpenAIFetcher.convertStreamToApiChoices(
			result.val,
			() => undefined,
			TelemetryWithExp.createEmptyConfigForTesting(),
			CancellationToken.None,
		);
		const collectedChoices = [];
		for await (const choice of choices) {
			collectedChoices.push(choice);
		}

		assert.strictEqual(collectedChoices.length, 1);
		assert.strictEqual(collectedChoices[0].completionText, ' completion');
		assert.strictEqual(collectedChoices[0].requestId.headerRequestId, '');
		assert.strictEqual(collectedChoices[0].requestId.gitHubRequestId, '');
		assert.strictEqual(collectedChoices[0].requestId.serverExperiments, '');
		assert.strictEqual(collectedChoices[0].requestId.deploymentId, '');
	});

	test('custom completion success responses ignore custom endpoint processing time headers', async function () {
		const maliciousHeaders = new HeadersImpl({
			'openai-processing-ms': '98765',
		});
		async function* completions() {
			yield {
				choices: [{
					index: 0,
					finish_reason: null,
					logprobs: null,
					text: ' completion',
				}],
				system_fingerprint: 'custom-system',
				object: 'text_completion',
				usage: undefined,
			};
		}
		const mockResponse = Response.fromText(200, 'OK', maliciousHeaders, '', 'test-stub');
		const responseStream = new ResponseStream(
			mockResponse,
			completions(),
			{
				headerRequestId: '',
				gitHubRequestId: '',
				completionId: '',
				created: 0,
				serverExperiments: '',
				deploymentId: '',
			},
			maliciousHeaders,
		);
		const mockFetchService = new MockCompletionsFetchService();
		mockFetchService.nextResult = Result.ok(responseStream);
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, mockFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'local-gemma',
			url: 'http://127.0.0.1:8080',
		}]);

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		const result = await openAIFetcher.fetchAndStreamCompletions(
			{
				prompt: {
					prefix: 'const value = ',
					suffix: ';',
					isFimEnabled: true,
				},
				languageId: 'typescript',
				repoInfo: undefined,
				engineModelId: 'local-gemma',
				count: 1,
				uiKind: CopilotUiKind.GhostText,
				ourRequestId: generateUuid(),
				extra: {},
			},
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined
		);

		assert.strictEqual(result.type, 'success');
		if (result.type !== 'success') {
			throw new Error('expected custom completion request to succeed');
		}
		assert.strictEqual(result.getProcessingTime(), 0);

		const collectedChoices = [];
		for await (const choice of result.choices) {
			collectedChoices.push(choice);
		}
		assert.strictEqual(collectedChoices.length, 1);
		assert.strictEqual(collectedChoices[0].completionText, ' completion');
	});

	test('custom completion model IDs that collide with hosted models use the hosted completion route', async function () {
		const recordingFetchService = new MockCompletionsFetchService();
		const serviceCollectionClone = serviceCollection.clone();
		serviceCollectionClone.define(ICompletionsFetchService, recordingFetchService);
		const accessor = serviceCollectionClone.createTestingAccessor();
		const configProvider = accessor.get(ICompletionsConfigProvider) as InMemoryConfigProvider;
		configProvider.setConfig(ConfigKey.CustomCompletionModels, [{
			id: 'gpt-41-copilot',
			url: 'http://127.0.0.1:8080',
			requestHeaders: {
				'X-Local-Model': '1',
			},
		}]);
		const modelManager = accessor.get(ICompletionsModelManagerService) as AvailableModelsManager;
		modelManager.fetchedModelData = [hostedCompletionModel('gpt-41-copilot')];

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		await openAIFetcher.fetchAndStreamCompletions(
			{
				prompt: {
					prefix: 'function add(a, b) {',
					suffix: '\n}',
					isFimEnabled: true,
				},
				languageId: 'javascript',
				repoInfo: undefined,
				engineModelId: 'gpt-41-copilot',
				count: 1,
				uiKind: CopilotUiKind.GhostText,
				ourRequestId: generateUuid(),
				extra: {},
			},
			TelemetryWithExp.createEmptyConfigForTesting(),
			() => undefined
		);

		assert.notStrictEqual(recordingFetchService.lastSecretKey, undefined);
		assert.strictEqual(recordingFetchService.lastParams?.model, undefined);
		assert.strictEqual(recordingFetchService.lastHeaders?.['X-Local-Model'], undefined);
		assert.ok(recordingFetchService.lastUrl?.includes('/gpt-41-copilot/'));
	});

});

suite('Telemetry sent on fetch', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		const serviceCollection = createLibTestingContext();
		serviceCollection.define(ICompletionsFetchService, new MockCompletionsFetchService());
		accessor = serviceCollection.createTestingAccessor();
	});

	test('sanitizeRequestOptionTelemetry properly excludes top-level keys', function () {
		const request = {
			prompt: 'prompt prefix',
			suffix: 'prompt suffix',
			stream: true as const,
			count: 1,
			extra: {
				language: 'python',
			},
		};

		const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();

		sanitizeRequestOptionTelemetry(request, telemetryWithExp, ['prompt', 'suffix']);

		assert.deepStrictEqual(telemetryWithExp.properties, {
			'request.option.stream': 'true',
			'request.option.count': '1',
			'request.option.extra': '{"language":"python"}',
		});
	});

	test('sanitizeRequestOptionTelemetry properly excludes `extra` keys', function () {
		const request = {
			prompt: 'prefix without context',
			suffix: 'prompt suffix',
			stream: true as const,
			count: 1,
			extra: {
				language: 'python',
				context: ['# Language: Python'],
			},
		};

		const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();

		sanitizeRequestOptionTelemetry(request, telemetryWithExp, ['prompt', 'suffix'], ['context']);

		assert.deepStrictEqual(telemetryWithExp.properties, {
			'request.option.stream': 'true',
			'request.option.count': '1',
			'request.option.extra': '{"language":"python"}',
		});
	});

	test('If context is provided while in the split context experiment, only send it in restricted telemetry events', async function () {
		const params: CompletionParams = {
			prompt: {
				context: ['# Language: Python'],
				prefix: 'prefix without context',
				suffix: '\ndef sum(a, b):\n    return a + b',
				isFimEnabled: true,
			},
			languageId: 'python',
			repoInfo: undefined,
			engineModelId: 'copilot-codex',
			count: 1,
			uiKind: CopilotUiKind.GhostText,
			postOptions: {},
			ourRequestId: generateUuid(),
			extra: {},
		};

		const openAIFetcher = accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		const telemetryWithExp = TelemetryWithExp.createEmptyConfigForTesting();
		telemetryWithExp.filtersAndExp.exp.variables.copilotenablepromptcontextproxyfield = true;

		const { reporter } = await withInMemoryTelemetry(accessor, async () => {
			await openAIFetcher.fetchAndStreamCompletions(params, telemetryWithExp, () => undefined);
		});

		const standardEvents = reporter.events;
		const hasContext = standardEvents.some(event => event.properties['request_option_extra']?.includes('context'));
		assert.strictEqual(hasContext, false, 'Standard telemetry event should not include context');

		// todo@dbaeumer we need to understand what our restricted telemetry story is.
		// const restrictedEvents = enhancedReporter.events;
		// const hasRestrictedContext = restrictedEvents.some(event =>
		//     event.properties['request_option_extra']?.includes('context')
		// );
		// assert.strictEqual(hasRestrictedContext, true, 'Restricted telemetry event should include context');
	});

	test('If context is provided, include it in `engine.prompt` telemetry events', function () { });
});

class TestStatusReporter extends StatusReporter {
	eventCount = 0;
	kind = 'Normal';
	message = '';
	command: string | undefined;

	override didChange(event: StatusChangedEvent): void {
		this.eventCount++;
		this.kind = event.kind;
		this.message = event.message || '';
		this.command = event.command?.command;
	}
}

async function assertResponseWithStatus(
	statusCode: number,
	statusReporter: ICompletionsStatusReporter,
	headers?: Record<string, string>
) {
	const serviceCollection = createLibTestingContext();
	serviceCollection.define(ICompletionsStatusReporter, statusReporter);
	const mockFetch = new MockCompletionsFetchService();
	serviceCollection.define(ICompletionsFetchService, mockFetch);
	serviceCollection.define(ICompletionsOpenAIFetcherService, new SyncDescriptor(LiveOpenAIFetcher));
	const accessor = serviceCollection.createTestingAccessor();
	const copilotTokenManager = accessor.get(ICompletionsCopilotTokenManager);
	await copilotTokenManager.primeToken(); // Trigger initial status
	return assertResponseWithContext(accessor, statusCode, headers);
}

async function assertResponseWithContext(accessor: ServicesAccessor, statusCode: number, headers?: Record<string, string>) {
	const fakeHeaders = new HeadersImpl({
		'x-github-request-id': '1',
		...headers,
	});
	const mockFetch = (() => {
		try {
			return accessor.get(ICompletionsFetchService) as MockCompletionsFetchService;
		} catch {
			const mock = new MockCompletionsFetchService();
			return mock;
		}
	})();
	mockFetch.nextResult = Result.error(new Completions.UnsuccessfulResponse(
		statusCode,
		'status text',
		fakeHeaders,
		() => Promise.resolve('response-text')
	));
	const fetcher = (() => {
		try {
			return accessor.get(ICompletionsOpenAIFetcherService);
		} catch {
			return accessor.get(IInstantiationService).createInstance(LiveOpenAIFetcher);
		}
	})();
	const completionParams: CompletionParams = fakeCompletionParams();
	const result = await fetcher.fetchAndStreamCompletions(
		completionParams,
		TelemetryWithExp.createEmptyConfigForTesting(),
		() => Promise.reject(new Error()),
		new CancellationTokenSource().token
	);
	return result;
}

function fakeCompletionParams(): CompletionParams {
	return {
		prompt: {
			prefix: 'xxx',
			suffix: '',
			isFimEnabled: false,
		},
		languageId: '',
		repoInfo: undefined,
		ourRequestId: generateUuid(),
		engineModelId: 'foo/bar',
		count: 1,
		uiKind: CopilotUiKind.GhostText,
		postOptions: {},
		extra: {},
	};
}

class MockCompletionsFetchService implements ICompletionsFetchService {
	declare _serviceBrand: undefined;

	nextResult: Result<ResponseStream, Completions.CompletionsFetchFailure> | undefined;
	lastUrl: string | undefined;
	lastSecretKey: string | undefined;
	lastParams: Completions.ModelParams | undefined;
	lastHeaders: Record<string, string> | undefined;

	async fetch(
		url: string,
		secretKey: string | undefined,
		params: Completions.ModelParams,
		_requestId: string,
		_ct: CancellationToken,
		headerOverrides?: Record<string, string>
	): Promise<Result<ResponseStream, Completions.CompletionsFetchFailure>> {
		this.lastUrl = url;
		this.lastSecretKey = secretKey;
		this.lastParams = params;
		this.lastHeaders = headerOverrides;
		if (this.nextResult) {
			const result = this.nextResult;
			this.nextResult = undefined;
			return result;
		}
		// Default: return a cancelled result
		return Result.error(new Completions.RequestCancelled());
	}

	async disconnectAll() { }
}

function hostedCompletionModel(id: string): ICompletionModelInformation {
	return {
		id,
		vendor: 'github',
		name: id,
		model_picker_enabled: true,
		preview: false,
		is_chat_default: false,
		is_chat_fallback: false,
		version: '1',
		capabilities: {
			type: 'completion',
			family: id,
			tokenizer: TokenizerType.O200K,
		},
	};
}
