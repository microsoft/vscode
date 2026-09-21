/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastDeepPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IAgentNetworkFilterService } from '../../../../../../../platform/networkFilter/common/networkFilterService.js';
import { IWebContentExtractorService } from '../../../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestContextService, TestFileService } from '../../../../../../test/common/workbenchTestServices.js';
import { MockTrustedDomainService } from '../../../../../url/test/browser/mockTrustedDomainService.js';
import { IChatToolRiskAssessmentService } from '../../../../browser/tools/chatToolRiskAssessmentService.js';
import { LanguageModelToolsService } from '../../../../browser/tools/languageModelToolsService.js';
import { IChatService, IChatToolInvocation, ToolConfirmKind } from '../../../../common/chatService/chatService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatModel, IChatRequestModel } from '../../../../common/model/chatModel.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';
import { ChatUrlFetchingConfirmationContribution } from '../../../../common/tools/builtinTools/chatUrlFetchingConfirmation.js';
import { ILanguageModelToolsConfirmationService } from '../../../../common/tools/languageModelToolsConfirmationService.js';
import { IToolResultCompressor } from '../../../../common/tools/toolResultCompressor.js';
import { FetchWebPageTool, FetchWebPageToolData, IFetchWebPageToolParams } from '../../../../electron-browser/builtInTools/fetchPageTool.js';
import { MockChatService } from '../../../common/chatService/mockChatService.js';
import { MockLanguageModelToolsConfirmationService } from '../../../common/tools/mockLanguageModelToolsConfirmationService.js';

function messageText(message: string | IMarkdownString | undefined): string | undefined {
	return typeof message === 'string' ? message : message?.value;
}

suite('FetchWebPageTool effective paths', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const wiki = 'https://github.com/microsoft/vscode/wiki';
	const traversalCases = [
		{ name: 'raw dots', url: `${wiki}/../../../attacker/repo/wiki/Home` },
		{ name: 'encoded dots', url: `${wiki}/%2e%2e/%2E%2E/.%2e/attacker/repo/wiki/Home` },
		{ name: 'encoded slashes', url: `${wiki}/..%2f..%2F..%2fattacker/repo/wiki/Home` },
		{ name: 'encoded backslashes', url: `${wiki}/..%5c..%5C..%5cattacker/repo/wiki/Home` },
		{ name: 'literal backslashes', url: String.raw`${wiki}\..\..\..\attacker\repo\wiki\Home` },
		{ name: 'browser-encoded dots', url: `${wiki}/%252e%252e/%252e%252e/%252e%252e/attacker/repo/wiki/Home` },
	];

	function createFixture(trustedDomains: string[] = [], prompt = 'Inspect the project documentation') {
		const policyUris: string[] = [];
		const extractedUris: string[] = [];
		const browserDestinations: string[] = [];
		const extractor: IWebContentExtractorService = {
			_serviceBrand: undefined,
			extract: async uris => {
				extractedUris.push(...uris.map(uri => uri.toString(true)));
				browserDestinations.push(...uris.map(uri => new URL(uri.toString(true)).href));
				return uris.map(() => ({ status: 'ok', result: 'Offline fixture content' }));
			},
		};
		const networkFilter: IAgentNetworkFilterService = {
			_serviceBrand: undefined,
			onDidChange: Event.None,
			isEnabled: () => false,
			isUriAllowed: uri => {
				policyUris.push(uri.toString(true));
				return true;
			},
			formatError: uri => `Blocked ${uri.authority}`,
		};
		const chatService = new MockChatService();
		const sessionResource = LocalChatSessionUri.forSession('url-path-fixture');
		const request = upcastDeepPartial<IChatRequestModel>({
			id: 'url-path-request',
			modelId: 'test-model',
			message: { text: prompt },
		});
		chatService.addSession(upcastDeepPartial<IChatModel>({
			sessionId: 'url-path-fixture',
			sessionResource,
			getRequests: () => [request],
		}));
		const tool = new FetchWebPageTool(
			extractor,
			new TestFileService(),
			new MockTrustedDomainService(trustedDomains),
			chatService,
			new TestContextService(),
			networkFilter,
		);
		return { tool, chatService, sessionResource, policyUris, extractedUris, browserDestinations };
	}

	for (const { name, url } of traversalCases) {
		test(`uses the effective ${name} path for policy, confirmation and extraction`, async () => {
			const fixture = createFixture();
			const prepared = await fixture.tool.prepareToolInvocation(
				{ parameters: { urls: [url] }, toolCallId: 'path-test', chatSessionResource: undefined },
				CancellationToken.None
			);
			const effectsBeforeInvocation = fixture.extractedUris.length;
			const result = await fixture.tool.invoke(
				{ callId: 'path-test', toolId: FetchWebPageToolData.id, parameters: { urls: [url] }, context: undefined },
				async () => 0,
				{ report: () => { } },
				CancellationToken.None
			);
			const destination = 'https://github.com/attacker/repo/wiki/Home';
			assert.deepStrictEqual({
				effectsBeforeInvocation,
				policy: fixture.policyUris,
				confirmation: messageText(prepared?.confirmationMessages?.message),
				invocation: messageText(prepared?.invocationMessage),
				extracted: fixture.extractedUris,
				browser: fixture.browserDestinations,
				details: Array.isArray(result.toolResultDetails) ? result.toolResultDetails.map(uri => URI.isUri(uri) ? uri.toString(true) : uri) : result.toolResultDetails,
			}, {
				effectsBeforeInvocation: 0,
				policy: [destination, destination],
				confirmation: destination,
				invocation: `Fetching ${destination}`,
				extracted: [destination],
				browser: [destination],
				details: [destination],
			});
		});
	}

	const orchestrationCases: { name: string; url: string; destination?: string; rules?: Record<string, boolean> }[] = [
		...traversalCases.map(({ name, url }) => ({
			name: `real tool orchestration has zero fetch effects when ${name} escape is declined`,
			url,
		})),
		{ name: 'real tool orchestration still auto-approves an ordinary allowed URL', url: `${wiki}/Home`, destination: `${wiki}/Home` },
		{ name: 'real tool orchestration still auto-approves an in-scope dot path', url: `${wiki}/topics/../Home`, destination: `${wiki}/Home` },
		{ name: 'real tool orchestration has zero fetch effects for an ordinary declined URL', url: 'https://github.com/attacker/repo/wiki/Home' },
		{
			name: 'review regression: real tool orchestration respects encoded path exclusions',
			url: 'https://example.test/private%20docs/secret',
			rules: { 'https://example.test/private%20docs/*': false, 'https://example.test': true },
		},
		{
			name: 'review regression: real tool orchestration respects mixed-case hostname exclusions',
			url: 'https://PRIVATE.example.test/secret',
			rules: { 'https://private.example.test': false, 'https://*.example.test': true },
		},
		{
			name: 'review regression: real tool orchestration does not implicitly trust encoded authority slashes',
			url: 'https://evil.example%2F.localhost/collect',
		},
		{
			name: 'configured effective-path exclusion prevents real fetch after decline',
			url: 'https://example.test/private/secret',
			rules: { 'https://example.test/public/../private/*': false, 'https://example.test': true },
		},
	];
	for (const { name, url, destination, rules } of orchestrationCases) {
		test(name, async () => {
			const fixture = createFixture();
			const config = new TestConfigurationService();
			config.setUserConfiguration(ChatConfiguration.GlobalAutoApprove, false);
			config.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
			config.setUserConfiguration(ChatConfiguration.AutoApprovedUrls, rules ?? { [`${wiki}/*`]: true });
			const instantiationService = workbenchInstantiationService({
				configurationService: () => config,
				contextKeyService: () => store.add(new ContextKeyService(config)),
			}, store);
			instantiationService.stub(IChatService, fixture.chatService);
			const contribution = instantiationService.createInstance(
				ChatUrlFetchingConfirmationContribution,
				parameters => (parameters as IFetchWebPageToolParams).urls
			);
			const confirmations = new MockLanguageModelToolsConfirmationService();
			confirmations.getPreConfirmAction = ref => contribution.getPreConfirmAction(ref);
			confirmations.getPostConfirmAction = ref => contribution.getPostConfirmAction(ref);
			instantiationService.stub(ILanguageModelToolsConfirmationService, confirmations);
			instantiationService.stub(IToolResultCompressor, {
				_serviceBrand: undefined,
				registerFilter: () => { },
				registerCache: () => { },
				maybeCompress: () => undefined,
			});
			instantiationService.stub(IChatToolRiskAssessmentService, {
				_serviceBrand: undefined,
				isEnabled: () => false,
				getCached: () => undefined,
				assess: async () => undefined,
			});
			const service = store.add(instantiationService.createInstance(LanguageModelToolsService));
			store.add(service.registerTool(FetchWebPageToolData, fixture.tool));
			let shownForConfirmation = false;
			fixture.chatService.appendProgress = (_request, progress) => {
				if (progress.kind === 'toolInvocation') {
					shownForConfirmation = progress.state.get().type === IChatToolInvocation.StateKind.WaitingForConfirmation;
					IChatToolInvocation.confirmWith(progress, { type: ToolConfirmKind.Skipped });
				}
			};
			const result = await service.invokeTool({
				callId: 'orchestrated-path-test',
				toolId: FetchWebPageToolData.id,
				parameters: { urls: [url] },
				context: { sessionResource: fixture.sessionResource },
			}, async () => 0, CancellationToken.None);
			assert.deepStrictEqual({
				shownForConfirmation,
				extracted: fixture.extractedUris,
				browser: fixture.browserDestinations,
				result: result.content[0].value,
			}, {
				shownForConfirmation: destination === undefined,
				extracted: destination ? [destination] : [],
				browser: destination ? [destination] : [],
				result: destination ? 'Offline fixture content' : 'The user chose to skip the tool call, they want to proceed without running it',
			});
		});
	}

	test('review regression: confirmation actions handle leading authority separators', async () => {
		const urls = ['https://example.test/valid', String.raw`https://\\evil.example/collect`];
		const fixture = createFixture();
		const prepared = await fixture.tool.prepareToolInvocation(
			{ parameters: { urls }, toolCallId: 'mixed-separators', chatSessionResource: undefined },
			CancellationToken.None,
		);
		const instantiationService = workbenchInstantiationService(undefined, store);
		const contribution = instantiationService.createInstance(
			ChatUrlFetchingConfirmationContribution,
			parameters => (parameters as IFetchWebPageToolParams).urls,
		);
		const ref = { toolId: FetchWebPageToolData.id, source: FetchWebPageToolData.source, parameters: { urls } };
		assert.deepStrictEqual({
			requestActions: contribution.getPreConfirmActions(ref).map(action => action.label),
			responseActions: contribution.getPostConfirmActions(ref).map(action => action.label),
			title: prepared?.confirmationMessages?.title,
			policy: fixture.policyUris,
			extracted: fixture.extractedUris,
		}, {
			requestActions: ['Configure URL Approvals...'],
			responseActions: ['Configure URL Approvals...'],
			title: 'Fetch web pages?',
			policy: ['https://example.test/valid', 'https://evil.example/collect'],
			extracted: [],
		});
	});

	test('review regression: an explicitly referenced leading-separator URL retains its destination', async () => {
		const url = String.raw`https://\trusted.example/../evil.example/private`;
		const fixture = createFixture([], url);
		const prepared = await fixture.tool.prepareToolInvocation(
			{ parameters: { urls: [url] }, toolCallId: 'leading-separator', chatSessionResource: fixture.sessionResource },
			CancellationToken.None,
		);
		await fixture.tool.invoke(
			{ callId: 'leading-separator', toolId: FetchWebPageToolData.id, parameters: { urls: [url] }, context: undefined },
			async () => 0,
			{ report: () => { } },
			CancellationToken.None,
		);
		const destination = new URL(URI.parse(url).toString(true)).href;
		assert.deepStrictEqual({
			title: prepared?.confirmationMessages?.title,
			reason: prepared?.confirmationMessages?.confirmationNotNeededReason,
			policy: fixture.policyUris,
			destinations: fixture.browserDestinations,
		}, {
			title: undefined,
			reason: 'Auto approved because URL was in prompt',
			policy: [destination, destination],
			destinations: [destination],
		});
	});

	for (const url of [
		'https://%09%5Ctrusted.example/../evil.example/private?token=fixture',
		'https://%0D%5Ctrusted.example/../evil.example/private?token=fixture',
		'https://%0A%5Ctrusted.example/../evil.example/private?token=fixture',
		'https://example.test/public/../C:/Secret',
		'https://example.test/%2570rivate/secret',
	]) {
		test(`review serialized destination and prompt reference stay aligned for ${url}`, async () => {
			const fixture = createFixture([], url);
			const prepared = await fixture.tool.prepareToolInvocation(
				{ parameters: { urls: [url] }, toolCallId: 'serialization-review', chatSessionResource: fixture.sessionResource },
				CancellationToken.None,
			);
			await fixture.tool.invoke(
				{ callId: 'serialization-review', toolId: FetchWebPageToolData.id, parameters: { urls: [url] }, context: undefined },
				async () => 0,
				{ report: () => { } },
				CancellationToken.None,
			);
			const destination = new URL(URI.parse(url).toString(true)).href;
			assert.deepStrictEqual({
				title: prepared?.confirmationMessages?.title,
				reason: prepared?.confirmationMessages?.confirmationNotNeededReason,
				requested: fixture.browserDestinations,
				policy: fixture.policyUris.map(value => new URL(value).href),
			}, {
				title: undefined,
				reason: 'Auto approved because URL was in prompt',
				requested: [destination],
				policy: [destination, destination],
			});
		});
	}

	test('keeps an in-scope normalized path trusted without changing query or fragment values', async () => {
		const fixture = createFixture([`${wiki}/*`]);
		const url = String.raw`${wiki}/topics/../Home?next=\folder\..\child#..\part`;
		const prepared = await fixture.tool.prepareToolInvocation(
			{ parameters: { urls: [url] }, toolCallId: 'allowed-path-test', chatSessionResource: fixture.sessionResource },
			CancellationToken.None
		);
		assert.deepStrictEqual({
			message: messageText(prepared?.invocationMessage),
			title: prepared?.confirmationMessages?.title,
			policy: fixture.policyUris,
			extracted: fixture.extractedUris,
		}, {
			message: String.raw`Fetching ${wiki}/Home?next=\folder\..\child#..\part`,
			title: undefined,
			policy: [String.raw`${wiki}/Home?next=\folder\..\child#..\part`],
			extracted: [],
		});
	});

	test('recognizes an explicitly requested equivalent effective URL', async () => {
		const fixture = createFixture([], `${wiki}/topics/../Home`);
		const prepared = await fixture.tool.prepareToolInvocation(
			{ parameters: { urls: [`${wiki}/Home`] }, toolCallId: 'prompt-path-test', chatSessionResource: fixture.sessionResource },
			CancellationToken.None
		);
		assert.deepStrictEqual({
			title: prepared?.confirmationMessages?.title,
			reason: prepared?.confirmationMessages?.confirmationNotNeededReason,
			extracted: fixture.extractedUris,
		}, {
			title: undefined,
			reason: 'Auto approved because URL was in prompt',
			extracted: [],
		});
	});

	test('preserves ordinary allowed and declined preparation controls', async () => {
		const fixture = createFixture([`${wiki}/*`]);
		const urls = [`${wiki}/Home`, 'https://github.com/attacker/repo/wiki/Home'];
		const titles: (string | IMarkdownString | undefined)[] = [];
		for (const url of urls) {
			const prepared = await fixture.tool.prepareToolInvocation(
				{ parameters: { urls: [url] }, toolCallId: 'control-path-test', chatSessionResource: undefined },
				CancellationToken.None
			);
			titles.push(prepared?.confirmationMessages?.title);
		}
		assert.deepStrictEqual({
			titles,
			policy: fixture.policyUris,
			extracted: fixture.extractedUris,
		}, { titles: [undefined, 'Fetch web page?'], policy: urls, extracted: [] });
	});
});
