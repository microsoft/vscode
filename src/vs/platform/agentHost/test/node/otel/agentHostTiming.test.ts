/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdir, readFile, rm } from 'fs/promises';
import { join } from '../../../../../base/common/path.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { NullLogService } from '../../../../log/common/log.js';
import { ICompletedSpanData } from '../../../../otel/common/spanData.js';
import { IOtlpExportTraceServiceRequest } from '../../../../otel/node/otlp/otlpJsonTypes.js';
import { OTelSqliteStore } from '../../../../otel/node/sqlite/otelSqliteStore.js';
import { NullTelemetryService } from '../../../../telemetry/common/telemetryUtils.js';
import { AgentHostFirstResponseSpanName, AgentHostTimingAttributePrefix, AgentHostTurnTimingSpanName, agentHostTimingAttributes, type IAgentHostFirstResponseDiagnostic, type IAgentHostTurnTimingDiagnostic } from '../../../common/otel/agentHostTiming.js';
import { buildDefaultChatUri } from '../../../common/state/sessionState.js';
import { AgentHostClientConnectionService } from '../../../node/agentHostClientConnectionService.js';
import { AgentHostTelemetryReporter } from '../../../node/agentHostTelemetryReporter.js';
import { AgentHostTurnTracker } from '../../../node/agentHostTurnTracker.js';
import { AgentHostOTelService } from '../../../node/otel/agentHostOTelService.js';
import { MockAgent } from '../mockAgent.js';

suite('Agent Host timing OTel', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
	let disposables: DisposableStore;
	let directory: string;
	let outfile: string;
	const prefix = AgentHostTimingAttributePrefix;
	const host: IAgentHostTurnTimingDiagnostic = {
		provider: 'mock', turnId: 'request-1', agentSessionId: 'session-1', chatId: 'default',
		isSubagentSession: false, result: 'success', totalTime: 42,
		sendStageWorkingDirectoryMs: 0, sendStageCheckpointMs: 3,
		timeToProviderDispatch: 8, timeToFirstProgress: 12, timeToFirstSubstantiveProgress: 15,
		hostRootTurnOrdinal: 1, hostProcessAgeMs: 100, titleGenerationStrategy: 'deferred',
	};
	const renderer: IAgentHostFirstResponseDiagnostic = {
		provider: 'mock', requestId: 'request-1', agentSessionId: 'session-1', chatId: 'default',
		outcome: 'success', sessionTurnKind: 'first', invocationKind: 'newTurn',
		firstResponseTextMs: 60, rootToolCallsBeforeFirstText: 0, rendererRootInvocationOrdinal: 1,
		trustInteractionRequired: false, totalElapsedMs: 70, hasResponseText: true,
	};

	setup(async () => {
		disposables = testDisposables.add(new DisposableStore());
		directory = join(process.cwd(), '.build', `agent-host-timing-test-${generateUuid()}`);
		outfile = join(directory, 'agent-host-traces.jsonl');
		await mkdir(directory, { recursive: true });
	});

	teardown(async () => {
		disposables.dispose();
		await rm(directory, { recursive: true, force: true });
	});

	function createService(env: NodeJS.ProcessEnv, fetchFn = globalThis.fetch): AgentHostOTelService {
		const keys = new Set([...Object.keys(process.env).filter(key => key.startsWith('OTEL_') || key.startsWith('COPILOT_OTEL_')), ...Object.keys(env)]);
		const saved = new Map([...keys].map(key => [key, process.env[key]]));
		try {
			for (const key of keys) {
				delete process.env[key];
			}
			Object.assign(process.env, env);
			return disposables.add(new AgentHostOTelService(fetchFn, new NullLogService(), new class extends mock<INativeEnvironmentService>() {
				override readonly userDataPath = directory;
			}));
		} finally {
			for (const [key, value] of saved) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
	}

	async function readSpans(): Promise<ICompletedSpanData[]> {
		return (await readFile(outfile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
	}

	test('allowlists diagnostics, preserves zero, and omits unknown or invalid measurements', () => {
		const attributes = agentHostTimingAttributes({
			...host, agentSessionId: 'file:///private/workspace', chatId: '../private',
			sendStageAttachmentsMs: NaN, timeToFirstProgress: Infinity, hostProcessAgeMs: -1,
			prompt: 'private content', inputTokens: 99,
		} as IAgentHostTurnTimingDiagnostic, 'host')!;
		assert.deepStrictEqual({
			zero: attributes[`${prefix}sendStageWorkingDirectoryMs`],
			absent: ['agentSessionId', 'chatId', 'sendStageModelSelectionMs', 'sendStageAttachmentsMs', 'timeToFirstProgress', 'hostProcessAgeMs', 'prompt', 'inputTokens'].filter(key => attributes[`${prefix}${key}`] !== undefined),
			invalidJoin: agentHostTimingAttributes({ ...host, turnId: 'file:///private' }, 'host'),
		}, { zero: 0, absent: [], invalidJoin: undefined });
	});

	test('OTel off emits nothing, independently of content or product telemetry', async () => {
		const service = createService({ OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'true' });
		service.emitTurnTiming(host);
		service.emitFirstResponse(renderer);
		await service.flush();
		assert.strictEqual(service.diagnosticsEnabled, false);
		await assert.rejects(readFile(outfile), { code: 'ENOENT' });
	});

	test('exports text measurements only when response text was observed', async () => {
		const service = createService({ COPILOT_OTEL_FILE_EXPORTER_PATH: outfile });
		for (const hasResponseText of [false, true]) {
			service.emitFirstResponse({ ...renderer, hasResponseText, firstResponseTextMs: 0 });
		}
		await service.flush();
		assert.deepStrictEqual((await readSpans()).map(span => ({
			hasResponseText: span.attributes[`${prefix}hasResponseText`],
			firstResponseTextMs: span.attributes[`${prefix}firstResponseTextMs`],
			rootToolCallsBeforeFirstText: span.attributes[`${prefix}rootToolCallsBeforeFirstText`],
			rendererRootInvocationOrdinal: span.attributes[`${prefix}rendererRootInvocationOrdinal`],
			totalElapsedMs: span.attributes[`${prefix}totalElapsedMs`],
		})), [
			{ hasResponseText: false, firstResponseTextMs: undefined, rootToolCallsBeforeFirstText: undefined, rendererRootInvocationOrdinal: 1, totalElapsedMs: 70 },
			{ hasResponseText: true, firstResponseTextMs: 0, rootToolCallsBeforeFirstText: 0, rendererRootInvocationOrdinal: 1, totalElapsedMs: 70 },
		]);
	});

	test('exports numeric file metadata with content capture off and without model accounting', async () => {
		const service = createService({ COPILOT_OTEL_FILE_EXPORTER_PATH: outfile, OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'false' });
		service.emitTurnTiming(host);
		service.emitFirstResponse(renderer);
		await service.flush();
		await service.flush();
		const spans = await readSpans();
		assert.deepStrictEqual(spans.map(span => ({
			name: span.name, duration: span.endTime - span.startTime,
			attributes: Object.fromEntries(Object.entries(span.attributes).filter(([key]) => key.startsWith(prefix))),
		})), [
			{ name: AgentHostTurnTimingSpanName, duration: 0, attributes: agentHostTimingAttributes(host, 'host') },
			{ name: AgentHostFirstResponseSpanName, duration: 0, attributes: agentHostTimingAttributes(renderer, 'renderer') },
		]);
		assert.ok(spans.every(span => !Object.keys(span.attributes).some(key => key.startsWith('gen_ai.'))));
		service.dispose();
		service.emitTurnTiming(host);
		await service.flush();
		assert.strictEqual((await readSpans()).length, 2);
	});

	test('host lifecycle exports once for completion, cancellation and partial failure with product telemetry off', async () => {
		const service = createService({ COPILOT_OTEL_FILE_EXPORTER_PATH: outfile });
		const reporter = new AgentHostTelemetryReporter(NullTelemetryService, service);
		const tracker = disposables.add(new AgentHostTurnTracker(reporter, disposables.add(new AgentHostClientConnectionService()), new NullLogService()));
		const agent = disposables.add(new MockAgent());
		const chat = buildDefaultChatUri(URI.parse('mock:/session-1'));
		for (const result of ['success', 'error', 'cancelled'] as const) {
			tracker.turnStarted(agent, chat, result, undefined, undefined, 'default', undefined, undefined);
			tracker.markSendStage(chat, result, 'workingDirectory');
			if (result === 'success') {
				tracker.markSendDispatched(chat, result);
				tracker.markFirstProgress(chat, result);
			}
			assert.strictEqual(tracker.turnCompleted(chat, result, result), true);
			assert.strictEqual(tracker.turnCompleted(chat, result, result), false);
		}
		await service.flush();
		const spans = await readSpans();
		assert.deepStrictEqual(spans.map(span => ({
			result: span.attributes[`${prefix}result`],
			ordinal: span.attributes[`${prefix}hostRootTurnOrdinal`],
			dispatched: span.attributes[`${prefix}timeToProviderDispatch`] !== undefined,
			progress: span.attributes[`${prefix}timeToFirstProgress`] !== undefined,
			stage: typeof span.attributes[`${prefix}sendStageWorkingDirectoryMs`],
			unobservedStage: span.attributes[`${prefix}sendStageCheckpointMs`] !== undefined,
		})), [
			{ result: 'success', ordinal: 1, dispatched: true, progress: true, stage: 'number', unobservedStage: false },
			{ result: 'error', ordinal: 2, dispatched: false, progress: false, stage: 'number', unobservedStage: false },
			{ result: 'cancelled', ordinal: 3, dispatched: false, progress: false, stage: 'number', unobservedStage: false },
		]);
	});

	test('nondispatched renderer attempts retain outcome but do not invent text or host measurements', async () => {
		const service = createService({ COPILOT_OTEL_FILE_EXPORTER_PATH: outfile });
		service.emitFirstResponse({
			provider: 'mock', requestId: 'not-dispatched', outcome: 'notDispatched',
			sessionTurnKind: 'unknown', invocationKind: 'unknown', trustInteractionRequired: true,
			totalElapsedMs: 0, hasResponseText: false,
		});
		await service.flush();
		const [span] = await readSpans();
		assert.deepStrictEqual(span.attributes, {
			'service.namespace': 'vscode.agent-host', 'service.name': 'vscode-agent-host',
			[`${prefix}schemaVersion`]: 1, [`${prefix}source`]: 'renderer',
			[`${prefix}provider`]: 'mock', [`${prefix}turnId`]: 'not-dispatched',
			[`${prefix}requestId`]: 'not-dispatched', [`${prefix}outcome`]: 'notDispatched',
			[`${prefix}sessionTurnKind`]: 'unknown', [`${prefix}invocationKind`]: 'unknown',
			[`${prefix}trustInteractionRequired`]: true, [`${prefix}hasResponseText`]: false,
			[`${prefix}totalElapsedMs`]: 0,
		});
	});

	test('OTLP JSON export retains numeric and boolean types and exact join identity', async () => {
		const payloads: IOtlpExportTraceServiceRequest[] = [];
		const service = createService({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' }, async (_input, init) => {
			payloads.push(JSON.parse(Buffer.from(init!.body as ArrayBuffer).toString('utf8')));
			return new Response('', { status: 200 });
		});
		service.emitTurnTiming(host);
		service.emitFirstResponse(renderer);
		await service.flush();
		const spans = payloads.flatMap(payload => payload.resourceSpans!.flatMap(resource => resource.scopeSpans!.flatMap(scope => scope.spans!)));
		assert.deepStrictEqual(spans.map(span => ({
			name: span.name,
			join: span.attributes?.find(attribute => attribute.key === `${prefix}turnId`)?.value,
			source: span.attributes?.find(attribute => attribute.key === `${prefix}source`)?.value,
			zero: span.attributes?.find(attribute => attribute.key === `${prefix}${span.name === AgentHostTurnTimingSpanName ? 'sendStageWorkingDirectoryMs' : 'rootToolCallsBeforeFirstText'}`)?.value,
		})), [
			{ name: AgentHostTurnTimingSpanName, join: { stringValue: 'request-1' }, source: { stringValue: 'host' }, zero: { doubleValue: 0 } },
			{ name: AgentHostFirstResponseSpanName, join: { stringValue: 'request-1' }, source: { stringValue: 'renderer' }, zero: { doubleValue: 0 } },
		]);
	});

	test('DB mode persists and fans out each diagnostic once', async () => {
		const service = createService({ COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'true', COPILOT_OTEL_FILE_EXPORTER_PATH: outfile });
		service.emitTurnTiming(host);
		service.emitFirstResponse(renderer);
		await service.flush();
		const spans = await readSpans();
		assert.strictEqual(spans.length, 2);
		const reader = new OTelSqliteStore(service.getSpansDbPath()!.fsPath);
		try {
			assert.deepStrictEqual(spans.map(span => reader.getSpansByTraceId(span.traceId).length), [1, 1]);
			assert.deepStrictEqual({
				zero: reader.getSpanAttribute(spans[0].spanId, `${prefix}sendStageWorkingDirectoryMs`),
				boolean: reader.getSpanAttribute(spans[1].spanId, `${prefix}hasResponseText`),
			}, { zero: '0', boolean: 'true' });
		} finally {
			reader.close();
		}
	});

	test('session anchors advertise timing support before terminal diagnostics', async () => {
		const service = createService({ COPILOT_OTEL_FILE_EXPORTER_PATH: outfile });
		const first = service.getSessionTraceContext('session-1', 'mock:/session-1');
		assert.deepStrictEqual(service.getSessionTraceContext('session-1', 'mock:/session-1'), first);
		await service.flush();
		const spans = await readSpans();
		assert.strictEqual(spans.length, 1);
		assert.strictEqual(spans[0].name, 'vscode.agent_host.session');
		assert.strictEqual(spans[0].attributes[`${prefix}timingSchemaVersion`], 1);
	});
});
