/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, notStrictEqual, ok, strictEqual } from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import type * as http from 'http';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { OTelSqliteStore } from '../../../../otel/node/sqlite/otelSqliteStore.js';
import { OTLP_TRACES_PATH } from '../../../../otel/node/otlp/localOtlpReceiver.js';
import {
	IOtlpExportTraceServiceRequest,
	OtlpSpanKind,
} from '../../../../otel/node/otlp/otlpJsonTypes.js';
import { IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentHostOTelService, readAgentHostOTelEnv } from '../../../node/otel/agentHostOTelService.js';
import { AgentHostOTelSpansDbSubPath } from '../../../common/agentService.js';

interface IPostResponse {
	statusCode: number;
	body: string;
}

async function postOtlp(endpoint: string, payload: object): Promise<IPostResponse> {
	const httpModule = await import('http');
	const url = new URL(endpoint);
	const body = Buffer.from(JSON.stringify(payload), 'utf8');
	return new Promise<IPostResponse>((resolve, reject) => {
		const req: http.ClientRequest = httpModule.request({
			host: url.hostname,
			port: Number(url.port),
			method: 'POST',
			path: OTLP_TRACES_PATH,
			headers: {
				'content-type': 'application/json',
				'content-length': String(body.length),
			},
		});
		req.on('response', res => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => resolve({
				statusCode: res.statusCode ?? 0,
				body: Buffer.concat(chunks).toString('utf8'),
			}));
			res.on('error', reject);
		});
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

function makeOtlpRequest(traceId: string, spanId: string): IOtlpExportTraceServiceRequest {
	// Use a current-time span so the 7-day retention sweep run when a second
	// (reader) connection opens does not delete the row.
	const nowNs = `${Date.now()}000000`;
	const endNs = `${Date.now() + 500}000000`;
	return {
		resourceSpans: [{
			resource: {
				attributes: [
					{ key: 'service.name', value: { stringValue: 'agent-host-test' } },
				],
			},
			scopeSpans: [{
				scope: { name: 'github.copilot.agent' },
				spans: [{
					traceId,
					spanId,
					name: 'invoke_agent copilotcli',
					kind: OtlpSpanKind.INTERNAL,
					startTimeUnixNano: nowNs,
					endTimeUnixNano: endNs,
					attributes: [
						{ key: 'gen_ai.operation.name', value: { stringValue: 'invoke_agent' } },
						{ key: 'gen_ai.provider.name', value: { stringValue: 'github.copilot' } },
						{ key: 'gen_ai.agent.name', value: { stringValue: 'copilotcli' } },
						{ key: 'gen_ai.conversation.id', value: { stringValue: 'conv-1' } },
						{ key: 'gen_ai.request.model', value: { stringValue: 'gpt-4o' } },
					],
				}],
			}],
		}],
	};
}

interface ISavedEnv {
	[key: string]: string | undefined;
}

const OTEL_ENV_KEYS = [
	'COPILOT_OTEL_ENABLED',
	'COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED',
	'COPILOT_OTEL_EXPORTER_TYPE',
	'COPILOT_OTEL_ENDPOINT',
	'COPILOT_OTEL_FILE_EXPORTER_PATH',
	'COPILOT_OTEL_SOURCE_NAME',
	'COPILOT_OTEL_PROTOCOL',
	'OTEL_EXPORTER_OTLP_ENDPOINT',
	'OTEL_EXPORTER_OTLP_PROTOCOL',
	'OTEL_EXPORTER_OTLP_HEADERS',
	'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
] as const;

function saveEnv(): ISavedEnv {
	const saved: ISavedEnv = {};
	for (const key of OTEL_ENV_KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
	return saved;
}

function restoreEnv(saved: ISavedEnv): void {
	for (const [key, value] of Object.entries(saved)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
}

function makeEnvService(userDataPath: string): INativeEnvironmentService {
	const env: Partial<INativeEnvironmentService> = { _serviceBrand: undefined, userDataPath };
	return env as INativeEnvironmentService;
}

suite('platform/agentHost - AgentHostOTelService (integration)', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('readAgentHostOTelEnv: disabled when no relevant env vars are set', () => {
		const cfg = readAgentHostOTelEnv({});
		strictEqual(cfg.enabled, false);
		strictEqual(cfg.dbSpanExporter, false);
		strictEqual(cfg.exporterType, 'otlp-http');
	});

	test('readAgentHostOTelEnv: db mode implies enabled', () => {
		const cfg = readAgentHostOTelEnv({ COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'true' });
		strictEqual(cfg.enabled, true);
		strictEqual(cfg.dbSpanExporter, true);
	});

	test('readAgentHostOTelEnv: protocol=grpc downgrades to otlp-grpc exporter type', () => {
		const cfg = readAgentHostOTelEnv({
			COPILOT_OTEL_ENABLED: 'true',
			COPILOT_OTEL_EXPORTER_TYPE: 'otlp-http',
			OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
		});
		strictEqual(cfg.exporterType, 'otlp-grpc');
	});

	test('readAgentHostOTelEnv: parses OTEL_EXPORTER_OTLP_HEADERS into key-value map', () => {
		const cfg = readAgentHostOTelEnv({
			COPILOT_OTEL_ENABLED: 'true',
			OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer xyz,x-tenant=acme',
		});
		deepStrictEqual(cfg.headers, { authorization: 'Bearer xyz', 'x-tenant': 'acme' });
	});

	test('getSdkTelemetryConfig: returns undefined when fully disabled', async () => {
		const saved = saveEnv();
		try {
			const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
			store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService));
			di.set(IAgentHostOTelService, svc);

			strictEqual(await svc.getSdkTelemetryConfig(), undefined);
			strictEqual(svc.getSpansDbPath(), undefined);
		} finally {
			restoreEnv(saved);
		}
	});

	test('getSdkTelemetryConfig: pass-through mode returns user-configured exporter settings', async () => {
		const saved = saveEnv();
		try {
			process.env.COPILOT_OTEL_ENABLED = 'true';
			process.env.COPILOT_OTEL_EXPORTER_TYPE = 'console';
			process.env.COPILOT_OTEL_SOURCE_NAME = 'agent-host';
			process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';

			const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
			store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService));

			const cfg = await svc.getSdkTelemetryConfig();
			ok(cfg, 'expected a TelemetryConfig');
			strictEqual(cfg!.exporterType, 'console');
			strictEqual(cfg!.sourceName, 'agent-host');
			strictEqual(cfg!.captureContent, true);
			strictEqual(svc.getSpansDbPath(), undefined);
		} finally {
			restoreEnv(saved);
		}
	});

	test('DB mode: starts loopback, persists posted spans to SQLite, and exposes db path', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService));

			const cfg = await svc.getSdkTelemetryConfig();
			ok(cfg, 'expected a TelemetryConfig');
			strictEqual(cfg!.exporterType, 'otlp-http');
			ok(cfg!.otlpEndpoint?.startsWith('http://127.0.0.1:'), `expected loopback endpoint, got ${cfg!.otlpEndpoint}`);

			const dbPath = svc.getSpansDbPath();
			ok(dbPath, 'expected a db path in DB mode');
			// Normalize separators since URI.fsPath uses '\\' on Windows but
			// AgentHostOTelSpansDbSubPath is declared with POSIX separators.
			ok(dbPath!.fsPath.replace(/\\/g, '/').endsWith(AgentHostOTelSpansDbSubPath));

			// Post a valid OTLP/JSON payload to the loopback endpoint.
			const traceId = '1122334455667788aabbccddeeff0011';
			const spanIdA = '0000000000000001';
			const spanIdB = '0000000000000002';
			const res1 = await postOtlp(cfg!.otlpEndpoint!, makeOtlpRequest(traceId, spanIdA));
			strictEqual(res1.statusCode, 200, `unexpected res1: ${res1.body}`);
			const res2 = await postOtlp(cfg!.otlpEndpoint!, makeOtlpRequest(traceId, spanIdB));
			strictEqual(res2.statusCode, 200, `unexpected res2: ${res2.body}`);

			await svc.flush();

			// Calling again returns the same loopback endpoint (idempotent start).
			const cfg2 = await svc.getSdkTelemetryConfig();
			strictEqual(cfg2!.otlpEndpoint, cfg!.otlpEndpoint);

			// Verify spans landed in SQLite via a separate read-only connection.
			// (The store keeps the writer open with WAL; a parallel reader is safe.)
			const reader = new OTelSqliteStore(dbPath!.fsPath);
			try {
				const persisted = reader.getSpansByTraceId(traceId);
				strictEqual(persisted.length, 2, `expected 2 persisted spans, got ${persisted.length} (res1.body=${res1.body})`);
				const names = persisted.map(s => s.name).sort();
				deepStrictEqual(names, ['invoke_agent copilotcli', 'invoke_agent copilotcli']);
				const operationNames = persisted.map(s => s.operation_name);
				ok(operationNames.every(op => op === 'invoke_agent'));
				notStrictEqual(persisted[0].request_model, null);
			} finally {
				reader.close();
			}
		} finally {
			restoreEnv(saved);
			await cleanup();
		}
	});

	test('DB mode + external endpoint: outbound forwarder is configured (best-effort)', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			process.env.COPILOT_OTEL_EXPORTER_TYPE = 'otlp-http';
			// Point the forwarder at an unreachable port; the forwarder is "best-effort"
			// and must not fail ingestion when the external sink is down.
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:1';

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService));

			const cfg = await svc.getSdkTelemetryConfig();
			ok(cfg!.otlpEndpoint?.startsWith('http://127.0.0.1:'));
			// The SDK is still pointed at our loopback, not the user's endpoint.
			notStrictEqual(cfg!.otlpEndpoint, process.env.OTEL_EXPORTER_OTLP_ENDPOINT);

			const traceId = 'ffeeddccbbaa99887766554433221100';
			const res = await postOtlp(cfg!.otlpEndpoint!, makeOtlpRequest(traceId, '00000000000000ff'));
			strictEqual(res.statusCode, 200);
			// flush() awaits the forwarder Queue — must not throw even though the
			// upstream is unreachable.
			await svc.flush();
		} finally {
			restoreEnv(saved);
			await cleanup();
		}
	});
});
