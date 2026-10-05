/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, mkdtemp, readFile, rm } from 'fs/promises';
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
import { readAgentModelCallDiagnostics } from '../../../../common/meta/agentModelCallMeta.js';
import { buildDefaultChatUri } from '../../../../common/state/sessionState.js';
import { AgentHostE2EServerLease, createRealSession, driveTurnToCompletion, removeTempDirs } from '../harness/agentHostE2ETestHarness.js';
import { fetchSessionWithChat, TestProtocolClient } from '../../serverIntegrationTestHelpers.js';
import type { CapiReplayProxy } from '../harness/capiReplayProxy.js';
import { normalizeVolatileText } from '../harness/capiWireCodec.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

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

suite('Agent Host E2E — Copilot managed telemetry', function () {
	const createdSessions: string[] = [];
	const tempDirs: string[] = [];
	const spans: ICompletedSpanData[] = [];
	const decodeErrors: string[] = [];
	let client: TestProtocolClient;
	let lease: AgentHostE2EServerLease;
	let proxy: CapiReplayProxy;
	let endpoint: string;
	let cacheHome: string;
	let workspace: string;
	let collector: ILocalOtlpHttpReceiver;
	let initialized: boolean;

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
		const directory = await mkdtemp(join(tmpdir(), 'copilot-managed-otel-'));
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
			},
		});
		const acquired = await lease.acquire(this.currentTest!.title);
		client = acquired.client;
		assert.ok(acquired.server.capiReplay);
		proxy = acquired.server.capiReplay;
	});

	async function setPolicy(serviceName: string): Promise<number> {
		proxy.setManagedSettings({
			forceRemoteSettingsRefresh: false,
			telemetry: { enabled: true, endpoint, protocol: 'http/json', serviceName, captureContent: true },
		});
		// Evict only this test's disposable policy cache, never the runtime or its sessions.
		await rm(join(cacheHome, 'managed-settings'), { recursive: true, force: true });
		return proxy.managedSettingsRequestCount;
	}

	async function completeCapturedTurn(serviceName: string, sentinel: string, previousRequests: number): Promise<void> {
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
		const exported = await retry(async () => {
			const span = spans.find(span => span.attributes[GenAiAttr.OPERATION_NAME] === 'chat'
				&& span.attributes[GenAiAttr.CONVERSATION_ID] === diagnostics.sdkSessionId);
			assert.ok(span, `No inference span exported for ${sentinel}; received ${spans.map(span => span.name).join(', ')}`);
			return span;
		}, 100, 150);
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
		client = await lease.restart();
		initialized = false;
		await completeCapturedTurn('otel-policy-b', 'otel-restart-second', previousRequests);
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
		const directory = await mkdtemp(join(tmpdir(), 'copilot-otel-e2e-'));
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
		const workspace = await mkdtemp(join(tmpdir(), 'copilot-otel-turn-'));
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
