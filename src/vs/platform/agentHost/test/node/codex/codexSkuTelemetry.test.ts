/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { type DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import product from '../../../../product/common/product.js';
import { IProductService } from '../../../../product/common/productService.js';
import { ITelemetryService, TelemetryLevel, type ITelemetryData } from '../../../../telemetry/common/telemetry.js';
import { TelemetryService } from '../../../../telemetry/common/telemetryService.js';
import { AgentSession } from '../../../common/agent.js';
import { AgentHostConfigKey } from '../../../common/agentHostCustomizationConfig.js';
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from '../../../common/agentHostCheckpointService.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { AgentHostAuthenticationService } from '../../../node/agentHostAuthenticationService.js';
import { AgentHostClientConnectionService } from '../../../node/agentHostClientConnectionService.js';
import { IAgentHostCustomizationEnablementService } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from '../../../node/agentHostGitHubEndpointService.js';
import { IAgentHostProxyResolver } from '../../../node/agentHostProxyResolver.js';
import { IAgentHostSessionTitleSignal } from '../../../node/agentHostSessionTitleSignal.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { AgentHostTelemetryReporter } from '../../../node/agentHostTelemetryReporter.js';
import { AgentHostTelemetryService } from '../../../node/agentHostTelemetryService.js';
import { AgentHostToolCallTracker } from '../../../node/agentHostToolCallTracker.js';
import { AgentHostTurnTracker } from '../../../node/agentHostTurnTracker.js';
import { IAgentSdkDownloader } from '../../../node/agentSdkDownloader.js';
import { CodexAgent } from '../../../node/codex/codexAgent.js';
import { CodexProxyService, ICodexProxyService } from '../../../node/codex/codexProxyService.js';
import { CopilotApiError, CopilotApiService, ICopilotApiService, type FetchFunction } from '../../../node/shared/copilotApiService.js';
import { IAgentHostWorktreeIsolation, NullAgentHostWorktreeIsolation } from '../../../node/shared/worktreeIsolation.js';
import { createNullSessionDataService } from '../../common/sessionTestHelpers.js';
import { createTestAgentHostProxyResolver } from '../agentServiceTestUtils.js';
import { RecordingAgentSdkDownloader } from '../testAgentSdkDownloader.js';
import { createNoopCustomizationEnablementService } from '../testCustomizationEnablementService.js';

function createHarness(disposables: Pick<DisposableStore, 'add'>, fetch: FetchFunction) {
	const instantiationService = disposables.add(new TestInstantiationService());
	const warnings: string[] = [];
	const logService = new class extends NullLogService {
		override warn(message: string): void { warnings.push(message); }
	};
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
	const endpoints = disposables.add(new AgentHostGitHubEndpointService(configurationService, logService));
	const productService: IProductService = { _serviceBrand: undefined, ...product };
	const apiService = disposables.add(new CopilotApiService(fetch, logService, productService, endpoints));
	const events: { eventName: string; data: ITelemetryData }[] = [];
	const telemetry = disposables.add(new AgentHostTelemetryService(TelemetryService.createWithLevel({
		telemetryLevel: TelemetryLevel.USAGE,
		sendErrorTelemetry: true,
		appenders: [{
			log: (eventName, data) => events.push({ eventName, data }),
			flush: async () => { },
		}],
	}, productService)));
	instantiationService.stub(ILogService, logService);
	instantiationService.stub(IProductService, productService);
	instantiationService.stub(ITelemetryService, telemetry);
	instantiationService.stub(ICopilotApiService, apiService);
	instantiationService.stub(IAgentConfigurationService, configurationService);
	instantiationService.stub(IAgentHostGitHubEndpointService, endpoints);
	instantiationService.stub(ISessionDataService, createNullSessionDataService());
	instantiationService.stub(ICodexProxyService, disposables.add(new CodexProxyService(undefined, logService, apiService)));
	instantiationService.stub(IAgentHostWorktreeIsolation, new NullAgentHostWorktreeIsolation());
	instantiationService.stub(IAgentHostCustomizationEnablementService, createNoopCustomizationEnablementService());
	instantiationService.stub(IAgentHostProxyResolver, createTestAgentHostProxyResolver());
	const sdkDownloader = new RecordingAgentSdkDownloader();
	sdkDownloader.resolvableWithoutDownload = false;
	instantiationService.stub(IAgentSdkDownloader, sdkDownloader);
	instantiationService.stub(IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE);
	instantiationService.stub(IAgentHostOTelService, { _serviceBrand: undefined, getNativeSdkTelemetryConfig: async () => undefined });
	instantiationService.stub(IAgentHostSessionTitleSignal, { _serviceBrand: undefined, onDidChangeSessionTitle: Event.None });
	instantiationService.stub(INativeEnvironmentService, { userHome: URI.from({ scheme: Schemas.inMemory, path: '/sku-test-home' }) });
	const createAgent = () => disposables.add(instantiationService.createInstance(CodexAgent));
	const agent = createAgent();
	const authentication = disposables.add(new AgentHostAuthenticationService(logService));
	const clientConnections = disposables.add(new AgentHostClientConnectionService());
	const reporter = new AgentHostTelemetryReporter(telemetry);
	const tracker = disposables.add(new AgentHostTurnTracker(reporter, clientConnections, logService));
	const toolTracker = disposables.add(new AgentHostToolCallTracker(reporter, tracker, clientConnections));
	const session = AgentSession.uri(agent.id, 'sku-test').toString();
	return {
		agent, createAgent, apiService, authentication, configurationService, endpoints, telemetry, events, reporter, tracker, toolTracker, session, warnings,
		authenticate: (token: string) => authentication.authenticate({ resource: endpoints.getCopilotResource().resource, token }, [agent]),
		completeTurn: (turnId: string, turnAgent = agent) => {
			tracker.turnStarted(turnAgent, session, turnId, 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
			tracker.turnCompleted(session, turnId, 'success');
		},
		turnSkus: () => events.filter(event => event.eventName === 'agentHost.turnCompleted').map(event => event.data.copilotSku),
	};
}

suite('Codex Copilot SKU telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the authenticated CAPI account SKU without initializing Copilot', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
			access_type_sku: 'copilot_for_business_seat',
		}));

		await harness.authenticate('test-token-a');
		harness.completeTurn('first-turn');

		assert.deepStrictEqual(harness.turnSkus(), ['copilot_for_business_seat']);
	});

	test('does not attribute an earlier turn to a new account after token rotation or removal', async () => {
		const harness = createHarness(disposables, async (_url, options) => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
			access_type_sku: new Headers(options?.headers).get('Authorization') === 'Bearer test-token-a' ? 'sku-a' : 'sku-b',
		}));

		await harness.authenticate('test-token-a');
		harness.completeTurn('account-a');
		harness.tracker.turnStarted(harness.agent, harness.session, 'overlapping-a', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		await harness.authenticate('test-token-b');
		harness.tracker.turnCompleted(harness.session, 'overlapping-a', 'success');
		harness.completeTurn('account-b');
		await harness.authenticate('');
		harness.completeTurn('signed-out');

		assert.deepStrictEqual(harness.turnSkus(), ['sku-a', undefined, 'sku-b', undefined]);
	});

	test('rediscovers account metadata after changing the GitHub enterprise endpoint', async () => {
		const harness = createHarness(disposables, async url => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
			access_type_sku: String(url).startsWith('https://api.github.com/') ? 'dotcom-sku' : 'enterprise-sku',
		}));

		await harness.authenticate('test-token-a');
		harness.completeTurn('dotcom');
		harness.configurationService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://acme.ghe.com' });
		harness.completeTurn('endpoint-changed');
		await harness.authenticate('test-token-a');
		harness.completeTurn('enterprise');

		assert.deepStrictEqual(harness.turnSkus(), ['dotcom-sku', undefined, 'enterprise-sku']);
	});

	test('retries failed account discovery when the same credential is supplied again', async () => {
		let available = false;
		const harness = createHarness(disposables, async () => available
			? Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'recovered-sku' })
			: new Response('Unavailable', { status: 503 }));

		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		harness.completeTurn('discovery-unavailable');
		available = true;
		await harness.authenticate('test-token-a');
		harness.completeTurn('discovery-recovered');

		assert.deepStrictEqual(harness.turnSkus(), [undefined, 'recovered-sku']);
	});

	test('does not replay an old account after authentication completes out of order', async () => {
		const started = new DeferredPromise<void>();
		const oldAccount = new DeferredPromise<Response>();
		const harness = createHarness(disposables, async (_url, options) => {
			if (new Headers(options?.headers).get('Authorization') === 'Bearer test-token-a') {
				started.complete();
				return oldAccount.p;
			}
			return Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-b' });
		});

		const oldAuthentication = harness.authenticate('test-token-a');
		await started.p;
		await harness.authenticate('test-token-b');
		harness.completeTurn('new-account');
		oldAccount.complete(Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'stale-sku-a' }));
		await oldAuthentication;
		harness.completeTurn('old-discovery-finished');
		await harness.authentication.replay(harness.agent);
		harness.completeTurn('replayed');

		assert.deepStrictEqual(harness.turnSkus(), ['sku-b', 'sku-b', 'sku-b']);
	});

	test('an old endpoint authorization failure cannot clear the new endpoint account', async () => {
		const started = new DeferredPromise<void>();
		const oldResponse = new DeferredPromise<Response>();
		const harness = createHarness(disposables, async url => {
			if (String(url).endsWith('/responses')) {
				started.complete();
				return oldResponse.p;
			}
			return Response.json({
				endpoints: { api: 'https://api.githubcopilot.com' },
				access_type_sku: String(url).startsWith('https://api.github.com/') ? 'dotcom-sku' : 'enterprise-sku',
			});
		});
		await harness.authenticate('test-token-a');
		const rejected = assert.rejects(harness.apiService.responses('test-token-a', '{"model":"gpt-5.4"}'), CopilotApiError);
		await started.p;
		harness.configurationService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://acme.ghe.com' });
		await harness.authenticate('test-token-a');
		harness.completeTurn('new-endpoint');
		oldResponse.complete(new Response('Unauthorized', { status: 401 }));
		await rejected;
		harness.completeTurn('old-response-finished');

		assert.deepStrictEqual(harness.turnSkus(), ['enterprise-sku', 'enterprise-sku']);
	});

	test('does not emit a malformed non-string entitlement SKU', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 123,
		}));
		await harness.authenticate('test-token-a');
		harness.completeTurn('malformed-sku');

		assert.deepStrictEqual(harness.turnSkus(), [undefined]);
	});

	test('replays the latest account to a provider initialized during authentication', async () => {
		const started = new DeferredPromise<void>();
		const newAccount = new DeferredPromise<Response>();
		const harness = createHarness(disposables, async (_url, options) => {
			if (new Headers(options?.headers).get('Authorization') === 'Bearer test-token-b') {
				started.complete();
				return newAccount.p;
			}
			return Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a' });
		});
		await harness.authenticate('test-token-a');
		const authenticating = harness.authenticate('test-token-b');
		await started.p;
		const lateProvider = harness.createAgent();
		const replaying = harness.authentication.replay(lateProvider);
		newAccount.complete(Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-b' }));
		await Promise.all([authenticating, replaying]);
		harness.completeTurn('late-provider', lateProvider);

		assert.deepStrictEqual(harness.turnSkus(), ['sku-b']);
	});

	test('a turn started during revocation cannot retain the removed account', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a',
		}));
		await harness.authenticate('test-token-a');
		const revoking = harness.authenticate('');
		harness.tracker.turnStarted(harness.agent, harness.session, 'revoking', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		await revoking;
		harness.tracker.turnCompleted(harness.session, 'revoking', 'success');

		assert.deepStrictEqual(harness.turnSkus(), [undefined]);
	});

	test('does not relabel delayed tool telemetry with a later account', async () => {
		const harness = createHarness(disposables, async (_url, options) => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
			access_type_sku: new Headers(options?.headers).get('Authorization') === 'Bearer test-token-a' ? 'sku-a' : 'sku-b',
		}));
		await harness.authenticate('test-token-a');
		harness.tracker.turnStarted(harness.agent, harness.session, 'tool-turn', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		harness.toolTracker.toolCallStarted(harness.agent.id, harness.session, 'tool-turn', 'tool', 'grep', undefined, 'gpt-5.4', 'trusted');
		await harness.authenticate('test-token-b');
		harness.toolTracker.toolCallCompleted(harness.session, 'tool', { success: true, content: [], pastTenseMessage: 'Searched' });
		harness.toolTracker.clearSession(harness.session);
		harness.tracker.turnCompleted(harness.session, 'tool-turn', 'success');

		assert.deepStrictEqual(harness.events.filter(event => event.eventName === 'agentHost.toolInvoked' || event.eventName === 'languageModelToolInvoked')
			.map(event => ({ eventName: event.eventName, copilotSku: event.data.copilotSku })), [
			{ eventName: 'languageModelToolInvoked', copilotSku: undefined },
			{ eventName: 'agentHost.toolInvoked', copilotSku: undefined },
		]);
	});

	test('does not infer an account for arbitrary events that only name a provider', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a',
		}));
		await harness.authenticate('test-token-a');
		harness.telemetry.publicLog('unattributedEvent', { provider: harness.agent.id });

		assert.deepStrictEqual(harness.events.filter(event => event.eventName === 'unattributedEvent').map(event => event.data), [{ provider: 'codex' }]);
	});

	test('leaves ChatGPT-only and missing entitlement metadata unclassified', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
		}));
		await harness.apiService.resolveCopilotSku('another-provider-token');
		harness.completeTurn('chatgpt-only');
		await harness.authenticate('test-token-a');
		harness.completeTurn('no-sku-in-discovery');

		assert.deepStrictEqual(harness.turnSkus(), [undefined, undefined]);
	});

	test('clears a known SKU when CAPI rejects the credential without logging credentials or account identity', async () => {
		const harness = createHarness(disposables, async url => String(url).endsWith('/responses')
			? new Response('Unauthorized', { status: 401 })
			: Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a', login: 'private-test-login' }));
		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		harness.completeTurn('valid-account');
		await assert.rejects(harness.apiService.responses('test-token-a', '{"model":"gpt-5.4"}'), CopilotApiError);
		harness.completeTurn('rejected-credential');

		assert.deepStrictEqual({
			skus: harness.turnSkus(),
			exposesIdentity: /test-token-a|private-test-login/.test(JSON.stringify({ events: harness.events, warnings: harness.warnings })),
		}, { skus: ['sku-a', undefined], exposesIdentity: false });
	});

	test('uses metadata recovered by a CAPI request after initial discovery failed', async () => {
		let available = false;
		const harness = createHarness(disposables, async () => available
			? Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'recovered-sku' })
			: new Response('Unavailable', { status: 503 }));
		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		harness.tracker.turnStarted(harness.agent, harness.session, 'recovering', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		available = true;
		await harness.apiService.models('test-token-a');
		harness.tracker.turnCompleted(harness.session, 'recovering', 'success');

		assert.deepStrictEqual({ skus: harness.turnSkus(), loggedFailure: harness.warnings.some(message => message.includes('Copilot endpoint discovery failed: 503')) }, {
			skus: ['recovered-sku'], loggedFailure: true,
		});
	});

	test('does not resurrect revoked authentication when old discovery finishes later', async () => {
		const started = new DeferredPromise<void>();
		const discovery = new DeferredPromise<Response>();
		const harness = createHarness(disposables, async () => {
			started.complete();
			return discovery.p;
		});
		const authenticating = harness.authenticate('test-token-a');
		await started.p;
		await harness.authenticate('');
		discovery.complete(Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'stale-sku' }));
		await authenticating;
		await harness.authentication.replay(harness.agent);
		harness.completeTurn('revoked');

		assert.deepStrictEqual(harness.turnSkus(), [undefined]);
	});

	test('ignores a discovery response from an earlier endpoint even when token strings match', async () => {
		const started = new DeferredPromise<void>();
		const oldDiscovery = new DeferredPromise<Response>();
		const harness = createHarness(disposables, async url => {
			if (String(url).startsWith('https://api.github.com/')) {
				started.complete();
				return oldDiscovery.p;
			}
			return Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'enterprise-sku' });
		});
		const authenticating = harness.authenticate('test-token-a');
		await started.p;
		harness.configurationService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://acme.ghe.com' });
		await harness.authenticate('test-token-a');
		harness.completeTurn('enterprise');
		oldDiscovery.complete(Response.json({ endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'old-sku' }));
		await authenticating;
		harness.completeTurn('late-discovery');

		assert.deepStrictEqual(harness.turnSkus(), ['enterprise-sku', 'enterprise-sku']);
	});

	test('omits expired metadata and follows a refreshed entitlement for the same token', async () => {
		let sku = 'sku-a';
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: sku,
		}));
		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		harness.completeTurn('initial');
		const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
		try {
			clock.setSystemTime(Date.now() + 30 * 60 * 1000);
			harness.completeTurn('expired');
			sku = 'sku-b';
			await harness.apiService.models('test-token-a');
			harness.completeTurn('refreshed');

			assert.deepStrictEqual(harness.turnSkus(), ['sku-a', undefined, 'sku-b']);
		} finally {
			clock.restore();
		}
	});

	test('releases account metadata when the API service is disposed', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a',
		}));
		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		harness.apiService.dispose();
		harness.completeTurn('disposed-service');

		assert.deepStrictEqual(harness.turnSkus(), [undefined]);
	});

	test('an expired cache refresh keeps the endpoint it was called for', async () => {
		let retiredCredentialReachedEnterprise = false;
		const harness = createHarness(disposables, async url => {
			if (String(url).endsWith('/copilot_internal/user') && !String(url).startsWith('https://api.github.com/')) {
				retiredCredentialReachedEnterprise = true;
			}
			return Response.json({
				endpoints: { api: 'https://api.githubcopilot.com' },
				access_type_sku: String(url).startsWith('https://api.github.com/') ? 'dotcom-sku' : 'enterprise-sku',
			});
		});
		await harness.authenticate('test-token-a');
		await harness.agent.refreshModels();
		const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
		try {
			clock.setSystemTime(Date.now() + 30 * 60 * 1000);
			const refreshing = harness.apiService.resolveCopilotSku('test-token-a');
			harness.configurationService.updateRootConfig({ [AgentHostConfigKey.GithubEnterpriseUri]: 'https://acme.ghe.com' });

			assert.deepStrictEqual({
				resolvedSku: await refreshing,
				currentSku: harness.apiService.getCachedCopilotSku('test-token-a'),
				retiredCredentialReachedEnterprise,
			}, { resolvedSku: 'dotcom-sku', currentSku: undefined, retiredCredentialReachedEnterprise: false });
		} finally {
			clock.restore();
		}
	});

	test('retains the account of an in-flight turn when an unchanged credential is refreshed', async () => {
		const harness = createHarness(disposables, async () => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' }, access_type_sku: 'sku-a',
		}));
		await harness.authenticate('test-token-a');
		harness.tracker.turnStarted(harness.agent, harness.session, 'same-account', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		await harness.authenticate('test-token-a');
		harness.tracker.turnCompleted(harness.session, 'same-account', 'success');

		assert.deepStrictEqual(harness.turnSkus(), ['sku-a']);
	});

	test('captures authentication that becomes usable during host preparation at provider dispatch', async () => {
		const harness = createHarness(disposables, async (_url, options) => Response.json({
			endpoints: { api: 'https://api.githubcopilot.com' },
			access_type_sku: new Headers(options?.headers).get('Authorization') === 'Bearer test-token-a' ? 'sku-a' : 'sku-b',
		}));
		harness.tracker.turnStarted(harness.agent, harness.session, 'initializing', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		await harness.authenticate('test-token-a');
		harness.tracker.markSendDispatched(harness.session, 'initializing');
		harness.tracker.turnCompleted(harness.session, 'initializing', 'success');
		harness.tracker.turnStarted(harness.agent, harness.session, 'preparing', 'gpt-5.4', 'trusted', 'explicit', undefined, undefined);
		await harness.authenticate('test-token-b');
		harness.tracker.markSendDispatched(harness.session, 'preparing');
		harness.tracker.turnCompleted(harness.session, 'preparing', 'success');

		assert.deepStrictEqual(harness.turnSkus(), ['sku-a', 'sku-b']);
	});
});
