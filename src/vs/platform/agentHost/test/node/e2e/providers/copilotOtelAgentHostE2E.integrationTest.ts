/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../log/common/log.js';
import { GenAiAttr } from '../../../../../otel/common/genAiAttributes.js';
import type { ICompletedSpanData } from '../../../../../otel/common/spanData.js';
import { type ILocalOtlpHttpReceiver, startLocalOtlpHttpReceiver } from '../../../../../otel/node/otlp/localOtlpReceiver.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import { readAgentModelCallDiagnostics } from '../../../../common/meta/agentModelCallMeta.js';
import { ROOT_STATE_URI, buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { AgentHostE2EServerLease, createRealSession, driveTurnToCompletion, removeTempDirs, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import type { CapiReplayProxy } from '../harness/capiReplayProxy.js';
import { normalizeVolatileText } from '../harness/capiWireCodec.js';
import { assertExpectedFailure } from '../harness/expectedFailure.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';
import { createTestDirectory } from '../harness/testDirectories.js';

const RECORD = process.env['AGENT_HOST_REPLAY_RECORD'] === '1' || process.env['AGENT_HOST_UPDATE_SNAPSHOTS'] === '1';

const otelTestEnv = {
	// Keep native batch export within the bounded wait, independent of inherited or default scheduling.
	OTEL_BSP_SCHEDULE_DELAY: '100',
	OTEL_EXPORTER_OTLP_CERTIFICATE: '',
	OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '',
	OTEL_EXPORTER_OTLP_CLIENT_KEY: '',
	OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE: '',
	OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE: '',
	OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY: '',
};

interface ManagedTelemetryPolicy {
	enabled?: boolean;
	endpoint?: string;
	protocol?: 'http/json';
	serviceName?: string;
	captureContent?: boolean;
	lockCaptureContent?: boolean;
	capture?: { prompts?: boolean; responses?: boolean; identity?: boolean };
	resourceAttributes?: Record<string, string>;
}

suite('Agent Host E2E — Copilot managed telemetry', function () {
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	const spans: ICompletedSpanData[] = [];
	const decodeErrors: string[] = [];
	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	let proxy: CapiReplayProxy;
	let endpoint: string;
	let cacheHome: string;
	let workspace: string;
	let collector: ILocalOtlpHttpReceiver;
	let initialized: boolean;
	let testTitle: string;

	teardown(async function () {
		this.timeout(120_000);
		try {
			await lease?.release(createdSessions, this.currentTest?.state === 'failed');
		} finally {
			try {
				await lease?.dispose();
			} finally {
				collector?.dispose();
				await removeTempDirs(tempDirs);
			}
		}
	});

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(async function () {
		this.timeout(60_000);
		spans.length = 0;
		decodeErrors.length = 0;
		initialized = false;
		lease = undefined;
		testTitle = this.currentTest!.title;
		const directory = createTestDirectory(join(tmpdir(), 'copilot-managed-otel-'));
		tempDirs.push(directory);
		workspace = join(directory, 'workspace');
		await mkdir(workspace);
		cacheHome = join(directory, 'cache');
		collector = store.add(await startLocalOtlpHttpReceiver({
			onSpans: result => {
				spans.push(...result.spans);
				if (result.rejected) {
					decodeErrors.push(`${result.rejected} rejected spans: ${result.errors.join(', ')}`);
				}
			},
		}, new NullLogService()));
		endpoint = collector.baseUrl;
	});

	async function startHost(env: Record<string, string> = {}): Promise<void> {
		assert.strictEqual(lease, undefined);
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
			env: {
				...otelTestEnv,
				COPILOT_CACHE_HOME: cacheHome,
				COPILOT_MANAGED_SETTINGS_CACHE: 'true',
				COPILOT_OTEL_ENABLED: 'false',
				COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'false',
				COPILOT_OTEL_EXPORTER_TYPE: 'otlp-http',
				COPILOT_OTEL_FILE_EXPORTER_PATH: '',
				OTEL_EXPORTER_OTLP_ENDPOINT: '',
				OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
				OTEL_EXPORTER_OTLP_HEADERS: '',
				OTEL_EXPORTER_OTLP_TRACES_HEADERS: '',
				OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
				OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json',
				OTEL_SERVICE_NAME: '',
				OTEL_RESOURCE_ATTRIBUTES: '',
				OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false',
				OTEL_METRICS_EXPORTER: 'none',
				...env,
			},
		});
		const acquired = await lease.acquire(testTitle);
		client = acquired.client;
		assert.ok(acquired.server.capiReplay);
		proxy = acquired.server.capiReplay;
	}

	async function replacePolicy(telemetry: ManagedTelemetryPolicy | undefined): Promise<number> {
		if (!lease) {
			await startHost();
		}
		proxy.setManagedSettings({
			forceRemoteSettingsRefresh: false,
			...(telemetry ? { telemetry } : {}),
		});
		// Evict only this test's disposable policy cache, never the runtime or its sessions.
		await rm(join(cacheHome, 'managed-settings'), { recursive: true, force: true });
		return proxy.managedSettingsRequestCount;
	}

	async function setPolicy(serviceName: string, overrides: ManagedTelemetryPolicy = {}): Promise<number> {
		return replacePolicy({ enabled: true, endpoint, protocol: 'http/json', serviceName, captureContent: true, ...overrides });
	}

	async function completePolicyTurn(sentinel: string, previousRequests: number): Promise<{ session: string; sdkSessionId: string; message: string }> {
		const message = `Reply exactly "${sentinel}".`;
		let session: string;
		if (!initialized) {
			session = await createRealSession(client, COPILOT_CONFIG, sentinel, createdSessions, URI.file(workspace));
			initialized = true;
		} else {
			session = URI.from({ scheme: COPILOT_CONFIG.scheme, path: `/${generateUuid()}` }).toString();
			await client.call('createSession', {
				channel: session,
				provider: COPILOT_CONFIG.provider,
				workingDirectories: [URI.file(workspace).toString()],
				config: { isolation: 'folder' },
			});
			createdSessions.push(session);
			await client.call('subscribe', { channel: session });
			await client.call('subscribe', { channel: buildDefaultChatUri(session) });
		}
		await driveTurnToCompletion(client, session, sentinel, message, 1);
		assert.ok(proxy.managedSettingsRequestCount > previousRequests, 'The runtime must fetch the current managed policy');
		const state = await fetchSessionWithChat(client, session);
		const turn = state.turns.find(turn => turn.id === sentinel);
		assert.ok(turn?.usage, 'The completed turn must report model-call usage');
		const diagnostics = readAgentModelCallDiagnostics(turn.usage);
		assert.ok(diagnostics, 'The completed turn must identify its provider session');
		return { session, sdkSessionId: diagnostics.sdkSessionId, message };
	}

	async function inferenceSpan(sdkSessionId: string, received = spans, serviceName?: string): Promise<ICompletedSpanData> {
		return retry(async () => {
			const span = received.find(span => span.attributes[GenAiAttr.OPERATION_NAME] === 'chat'
				&& span.attributes[GenAiAttr.CONVERSATION_ID] === sdkSessionId
				&& (serviceName === undefined || span.attributes['service.name'] === serviceName));
			assert.ok(span, `No inference span exported for ${sdkSessionId}; received ${received.map(span => span.name).join(', ')}`);
			return span;
		}, 100, 150);
	}

	async function flushHost(): Promise<void> {
		assert.ok(lease);
		await lease.release(createdSessions);
		await lease.dispose();
		lease = undefined;
	}

	async function completeCapturedTurn(serviceName: string, sentinel: string, previousRequests: number): Promise<void> {
		const { sdkSessionId, message } = await completePolicyTurn(sentinel, previousRequests);
		const exported = await inferenceSpan(sdkSessionId);
		const input = exported.attributes['gen_ai.input.messages'];
		assert.strictEqual(typeof input, 'string', 'The inference span must capture structured input messages');
		const messages: { role: string; parts: { type: string; content: string }[] }[] = JSON.parse(String(input));
		assert.deepStrictEqual({
			serviceName: exported.attributes['service.name'],
			userMessages: messages.filter(message => message.role === 'user').map(message => ({
				...message,
				parts: message.parts.map(part => ({ ...part, content: normalizeVolatileText(part.content) })),
			})),
			decodeErrors,
		}, {
			serviceName,
			userMessages: [{ role: 'user', parts: [{ type: 'text', content: message }] }],
			decodeErrors: [],
		});
	}

	test('managed captureContent exports the user message across sessions', async function () {
		this.timeout(180_000);
		await completeCapturedTurn('otel-policy-a', 'otel-capture-first', await setPolicy('otel-policy-a'));
		await completeCapturedTurn('otel-policy-a', 'otel-capture-second', await setPolicy('otel-policy-a'));
	});

	test('new sessions honor changed managed telemetry without restarting', async function () {
		this.timeout(180_000);
		await completeCapturedTurn('otel-policy-a', 'otel-policy-first', await setPolicy('otel-policy-a'));
		await completeCapturedTurn('otel-policy-b', 'otel-policy-second', await setPolicy('otel-policy-b'));
	});

	test('new sessions honor changed managed telemetry after restarting', async function () {
		this.timeout(180_000);
		await completeCapturedTurn('otel-policy-a', 'otel-restart-first', await setPolicy('otel-policy-a'));
		const previousRequests = await setPolicy('otel-policy-b');
		assert.ok(lease);
		client = await lease.restart();
		initialized = false;
		await completeCapturedTurn('otel-policy-b', 'otel-restart-second', previousRequests);
	});

	for (const restriction of [
		{ name: 'captureContent denial', policy: { captureContent: false }, prompts: false, responses: false },
		{ name: 'prompt capture denial', policy: { capture: { prompts: false } }, prompts: false, responses: true },
		{ name: 'response capture denial', policy: { capture: { responses: false } }, prompts: true, responses: false },
		{ name: 'locked content capture', policy: { captureContent: undefined, lockCaptureContent: true }, prompts: false, responses: false },
		{ name: 'prompt-only capture', policy: { captureContent: false, capture: { prompts: true } }, prompts: true, responses: false },
		{ name: 'response-only capture', policy: { captureContent: false, capture: { responses: true } }, prompts: false, responses: true },
	] satisfies { name: string; policy: ManagedTelemetryPolicy; prompts: boolean; responses: boolean }[]) {
		test(`managed ${restriction.name} overrides local content opt-in`, async function () {
			this.timeout(180_000);
			await startHost({ OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true' });
			const turn = await completePolicyTurn('otel-private-message', await setPolicy('otel-private', restriction.policy));
			const span = await inferenceSpan(turn.sdkSessionId);
			assert.deepStrictEqual({
				prompts: typeof span.attributes['gen_ai.input.messages'] === 'string',
				responses: typeof span.attributes['gen_ai.output.messages'] === 'string',
				serviceName: span.attributes['service.name'],
				decodeErrors,
			}, { prompts: restriction.prompts, responses: restriction.responses, serviceName: 'otel-private', decodeErrors: [] });
			await flushHost();
			const exported = JSON.stringify(spans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId));
			if (!restriction.prompts && !restriction.responses) {
				assert.ok(!exported.includes('otel-private-message'), 'Denied content must not leak through another span or event');
			}
		});
	}

	(RECORD ? test.skip : test)('managed identity denial removes inherited identity from native spans', async function () {
		this.timeout(180_000);
		await startHost({
			COPILOT_OTEL_CAPTURE_IDENTITY: 'true',
			OTEL_RESOURCE_ATTRIBUTES: 'user.name=synthetic-account,process.user.name=synthetic-user,host.name=synthetic-host',
		});
		const turn = await completePolicyTurn('otel-identity', await setPolicy('otel-identity', { capture: { identity: false } }));
		await inferenceSpan(turn.sdkSessionId);
		await flushHost();
		const native = spans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId
			&& span.attributes['service.name'] === 'otel-identity');
		assert.ok(native.length > 0);
		const identityKeys = native.flatMap(span => [span.attributes, ...span.events.map(event => event.attributes ?? {})])
			.flatMap(attributes => Object.keys(attributes).filter(key => ['user.name', 'process.user.name', 'host.name'].includes(key)));
		assert.deepStrictEqual(identityKeys.filter(key => key !== 'user.name'), []);
		await assertExpectedFailure('Copilot native inherited identity redaction',
			/^Managed identity denial retained inherited identity resource attributes/, () => {
				assert.ok(identityKeys.length === 0, 'Managed identity denial retained inherited identity resource attributes');
				assert.ok(!JSON.stringify(native).includes('synthetic-account'));
			});
	});

	test('managed telemetry disablement overrides an environment-selected collector', async function () {
		this.timeout(180_000);
		await startHost({
			COPILOT_OTEL_ENABLED: 'true',
			OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
			OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${endpoint}/v1/traces`,
			OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
		});
		const turn = await completePolicyTurn('otel-disabled-message', await setPolicy('otel-disabled', { enabled: false }));
		await flushHost();
		assert.deepStrictEqual(spans.filter(span => span.attributes['service.name'] === 'otel-disabled'
			|| (span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId
				&& ['chat', 'invoke_agent'].includes(String(span.attributes[GenAiAttr.OPERATION_NAME])))), []);
	});

	test('new sessions route managed telemetry to different collectors without restarting', async function () {
		this.timeout(180_000);
		const secondSpans: ICompletedSpanData[] = [];
		const second = store.add(await startLocalOtlpHttpReceiver({
			onSpans: result => {
				secondSpans.push(...result.spans);
				if (result.rejected) {
					decodeErrors.push(`${result.rejected} rejected spans: ${result.errors.join(', ')}`);
				}
			}
		}, new NullLogService()));
		const first = await completePolicyTurn('otel-collector-first', await setPolicy('otel-collector-a'));
		await inferenceSpan(first.sdkSessionId);
		const next = await completePolicyTurn('otel-collector-second', await setPolicy('otel-collector-b', { endpoint: second.baseUrl }));
		const exported = await inferenceSpan(next.sdkSessionId, secondSpans);
		await flushHost();
		assert.deepStrictEqual({
			serviceName: exported.attributes['service.name'],
			firstAtSecond: secondSpans.some(span => span.attributes[GenAiAttr.CONVERSATION_ID] === first.sdkSessionId),
			secondAtFirst: spans.some(span => span.attributes[GenAiAttr.CONVERSATION_ID] === next.sdkSessionId),
			decodeErrors,
		}, { serviceName: 'otel-collector-b', firstAtSecond: false, secondAtFirst: false, decodeErrors: [] });
	});

	test('new sessions revoke managed content capture without restarting', async function () {
		this.timeout(180_000);
		await completeCapturedTurn('otel-revoke', 'otel-before-revocation', await setPolicy('otel-revoke'));
		const turn = await completePolicyTurn('otel-after-revocation', await setPolicy('otel-revoke', { captureContent: false }));
		await inferenceSpan(turn.sdkSessionId);
		await flushHost();
		const native = spans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId);
		assert.ok(!JSON.stringify(native).includes('otel-after-revocation'));
		assert.deepStrictEqual(native.filter(span => span.attributes['gen_ai.input.messages'] !== undefined
			|| span.attributes['gen_ai.output.messages'] !== undefined), []);
	});

	test('removing managed telemetry does not retain the previous exporter in a new session', async function () {
		this.timeout(180_000);
		await completeCapturedTurn('otel-remove', 'otel-before-removal', await setPolicy('otel-remove'));
		const turn = await completePolicyTurn('otel-after-removal', await replacePolicy(undefined));
		await flushHost();
		assert.deepStrictEqual(spans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId), []);
		assert.ok(!JSON.stringify(spans).includes('otel-after-removal'));
	});

	test('managed prompt capture can be reenabled after a denied session', async function () {
		this.timeout(180_000);
		const denied = await completePolicyTurn('otel-capture-denied', await setPolicy('otel-enable', { captureContent: false }));
		await inferenceSpan(denied.sdkSessionId);
		await completeCapturedTurn('otel-enable', 'otel-capture-enabled', await setPolicy('otel-enable'));
		await flushHost();
		assert.ok(!JSON.stringify(spans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === denied.sdkSessionId)).includes('otel-capture-denied'));
	});

	test('managed service identity overrides inherited service resource attributes', async function () {
		this.timeout(180_000);
		await startHost({ OTEL_SERVICE_NAME: 'local-service', OTEL_RESOURCE_ATTRIBUTES: 'service.name=local-resource-service' });
		const turn = await completePolicyTurn('otel-service-precedence', await setPolicy('managed-service'));
		const exported = await inferenceSpan(turn.sdkSessionId);
		assert.strictEqual(exported.attributes['service.name'], 'managed-service');
	});

	test('managed resource attributes override conflicts and retain unrelated environment attributes', async function () {
		this.timeout(180_000);
		await startHost({ OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=local,synthetic.environment=retained' });
		const turn = await completePolicyTurn('otel-resource-precedence', await setPolicy('otel-resources', {
			resourceAttributes: { 'deployment.environment.name': 'managed', 'synthetic.policy': 'managed-value' },
		}));
		const exported = await inferenceSpan(turn.sdkSessionId);
		assert.deepStrictEqual({
			environment: exported.attributes['deployment.environment.name'],
			retained: exported.attributes['synthetic.environment'],
			policy: exported.attributes['synthetic.policy'],
		}, { environment: 'managed', retained: 'retained', policy: 'managed-value' });
	});

	test('managed JSON protocol overrides inherited generic and trace-specific protobuf protocols', async function () {
		this.timeout(180_000);
		await startHost({ OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf', OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/protobuf' });
		const turn = await completePolicyTurn('otel-protocol-precedence', await setPolicy('otel-json'));
		const exported = await inferenceSpan(turn.sdkSessionId);
		assert.deepStrictEqual({ serviceName: exported.attributes['service.name'], decodeErrors }, { serviceName: 'otel-json', decodeErrors: [] });
	});

	test('managed collector overrides an inherited trace-specific endpoint', async function () {
		this.timeout(180_000);
		const localSpans: ICompletedSpanData[] = [];
		const local = store.add(await startLocalOtlpHttpReceiver({
			onSpans: result => {
				localSpans.push(...result.spans);
				if (result.rejected) {
					decodeErrors.push(`${result.rejected} rejected spans: ${result.errors.join(', ')}`);
				}
			}
		}, new NullLogService()));
		await startHost({
			COPILOT_OTEL_ENABLED: 'true',
			OTEL_EXPORTER_OTLP_ENDPOINT: local.baseUrl,
			OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${local.baseUrl}/v1/traces`,
		});
		const turn = await completePolicyTurn('otel-endpoint-precedence', await setPolicy('otel-managed-endpoint'));
		await inferenceSpan(turn.sdkSessionId);
		await flushHost();
		assert.deepStrictEqual(localSpans.filter(span => span.attributes[GenAiAttr.CONVERSATION_ID] === turn.sdkSessionId
			&& span.attributes['service.name'] === 'otel-managed-endpoint'), []);
		assert.deepStrictEqual(decodeErrors, []);
	});

	test('cold session resume applies revoked managed capture instead of the persisted policy', async function () {
		this.timeout(180_000);
		const first = await completePolicyTurn('otel-resume-before', await setPolicy('otel-resume-captured'));
		await inferenceSpan(first.sdkSessionId);
		const previousRequests = await setPolicy('otel-resume-denied', { captureContent: false });
		assert.ok(lease);
		client = await lease.restart();
		await client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: 'otel-resume-client' });
		await client.call('authenticate', { channel: ROOT_STATE_URI, resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, token: resolveGitHubToken() });
		await client.call('subscribe', { channel: first.session });
		await client.call('subscribe', { channel: buildDefaultChatUri(first.session) });
		await driveTurnToCompletion(client, first.session, 'otel-resume-after', 'Reply exactly "otel-resume-after".', 1);
		assert.ok(proxy.managedSettingsRequestCount > previousRequests);
		const exported = await inferenceSpan(first.sdkSessionId, spans, 'otel-resume-denied');
		assert.deepStrictEqual({
			input: exported.attributes['gen_ai.input.messages'],
			output: exported.attributes['gen_ai.output.messages'],
			decodeErrors,
		}, { input: undefined, output: undefined, decodeErrors: [] });
	});
});

suite('Agent Host E2E — Copilot OTel file exporter', function () {
	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease | undefined;
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	let exportFile: string;

	suiteSetup(async function () {
		this.timeout(60_000);
		const directory = createTestDirectory(join(tmpdir(), 'copilot-otel-e2e-'));
		tempDirs.push(directory);
		exportFile = join(directory, 'spans.jsonl');
		lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
			env: {
				...otelTestEnv,
				COPILOT_OTEL_ENABLED: 'true',
				COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'true',
				COPILOT_OTEL_EXPORTER_TYPE: 'file',
				COPILOT_OTEL_FILE_EXPORTER_PATH: exportFile,
				OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true',
			},
		});
	});

	setup(async function () {
		this.timeout(60_000);
		if (!lease) {
			throw new Error('OTel E2E server lease was not initialized');
		}
		({ client } = await lease.acquire(this.currentTest?.title ?? 'unknown'));
	});

	teardown(async function () {
		this.timeout(120_000);
		await lease?.release(createdSessions, this.currentTest?.state === 'failed');
	});

	suiteTeardown(async function () {
		this.timeout(120_000);
		const errors: Error[] = [];
		try {
			await lease?.dispose();
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await removeTempDirs(tempDirs);
		} catch (error) {
			errors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (errors.length > 0) {
			throw new AggregateError(errors, 'Failed to dispose Copilot OTel E2E resources');
		}
	});

	test('provider turn exports SDK spans through the Agent Host file exporter', async function () {
		this.timeout(180_000);
		const workspace = createTestDirectory(join(tmpdir(), 'copilot-otel-turn-'));
		tempDirs.push(workspace);
		const sessionUri = await createRealSession(client, COPILOT_CONFIG, 'copilot-otel-turn', createdSessions, URI.file(workspace));

		await driveTurnToCompletion(client, sessionUri, 'turn-otel-export', 'Reply exactly "traced".', 1);
		await driveTurnToCompletion(client, sessionUri, 'turn-otel-title', '/rename OTel Captured Title', 10, { expectUnread: false });
		const exported = await retry(async () => {
			const contents = await readFile(exportFile, 'utf8').catch(() => '');
			if (!contents.includes('"traceId"')
				|| !contents.includes('"spanId"')
				|| !contents.includes('vscode.agent_host.session.title_changed')
				|| !contents.includes('"name":"invoke_agent"')
				|| !contents.includes('"service.name":"github-copilot"')) {
				throw new Error(`OTel spans have not reached the file exporter: ${contents}`);
			}
			return contents;
		}, 100, 100);

		assert.ok(exported.split('\n').filter(Boolean).length > 0);
	});
});
