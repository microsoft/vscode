/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, notStrictEqual, ok, rejects, strictEqual } from 'assert';
import { access, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import type * as http from 'http';
import { tmpdir } from 'os';
import { join, resolve } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../log/common/log.js';
import { OTelSqliteStore } from '../../../../otel/node/sqlite/otelSqliteStore.js';
import { OTLP_TRACES_PATH } from '../../../../otel/node/otlp/localOtlpReceiver.js';
import type { ICompletedSpanData } from '../../../../otel/common/spanData.js';
import {
	IOtlpExportTraceServiceRequest,
	OtlpSpanKind,
} from '../../../../otel/node/otlp/otlpJsonTypes.js';
import { AgentHostComparisonAttemptCountAttribute, AgentHostComparisonAttemptIndexAttribute, AgentHostComparisonIdAttribute, AgentHostComparisonRoleAttribute, AgentHostSessionSpanName, AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute, IAgentHostOTelService } from '../../../common/otel/agentHostOTelService.js';
import { AgentHostOTelService, normalizeAgentHostOtlpBody, readAgentHostOTelEnv } from '../../../node/otel/agentHostOTelService.js';
import { AgentHostOTelEnvVars, AgentHostOTelSpansDbSubPath, buildAgentHostOTelEnv } from '../../../common/agentService.js';

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
	'COPILOT_OTEL_CAPTURE_IDENTITY',
	'COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED',
	'COPILOT_OTEL_EXPORTER_TYPE',
	'COPILOT_OTEL_ENDPOINT',
	'COPILOT_OTEL_FILE_EXPORTER_PATH',
	'VSCODE_AGENT_HOST_OTEL_FILE_PATH_IS_MANAGED',
	'COPILOT_OTEL_SOURCE_NAME',
	'COPILOT_OTEL_PROTOCOL',
	'OTEL_EXPORTER_OTLP_ENDPOINT',
	'OTEL_EXPORTER_OTLP_PROTOCOL',
	'OTEL_EXPORTER_OTLP_HEADERS',
	'OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT',
	'OTEL_RESOURCE_ATTRIBUTES',
	'OTEL_SERVICE_NAME',
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

function makeEnvService(userDataPath: string, userHome = tmpdir()): INativeEnvironmentService {
	const env: Partial<INativeEnvironmentService> = { _serviceBrand: undefined, userDataPath, userHome: URI.file(userHome) };
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

	test('identity capture is independent of content and does not enable telemetry', () => {
		for (const captureContent of ['true', 'false']) {
			for (const captureIdentity of [undefined, 'false', 'true']) {
				const cfg = readAgentHostOTelEnv({
					COPILOT_OTEL_CAPTURE_IDENTITY: captureIdentity,
					OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: captureContent,
					OTEL_RESOURCE_ATTRIBUTES: 'user.name=synthetic-account,process.user.name=synthetic-user,host.name=synthetic-host,custom=kept',
				});
				deepStrictEqual({
					enabled: cfg.enabled,
					captureIdentity: cfg.captureIdentity,
					resourceAttributes: cfg.resourceAttributes,
				}, {
					enabled: false,
					captureIdentity: captureIdentity === 'true',
					resourceAttributes: {
						...(captureIdentity === 'true' ? { 'user.name': 'synthetic-account', 'process.user.name': 'synthetic-user', 'host.name': 'synthetic-host' } : {}),
						custom: 'kept',
						'service.namespace': 'vscode.agent-host',
						'service.name': 'vscode-agent-host',
					},
				});
			}
		}
	});

	test('identity denial strips resource, scope, span, event, and link attributes before forwarding', () => {
		const attributes = [
			{ key: 'user.name', value: { stringValue: 'synthetic-account' } },
			{ key: 'process.user.name', value: { stringValue: 'synthetic-user' } },
			{ key: 'host.name', value: { stringValue: 'synthetic-host' } },
			{ key: 'custom', value: { stringValue: 'kept' } },
		];
		const payload = {
			resourceSpans: [{
				resource: { attributes },
				scopeSpans: [{
					scope: { attributes },
					spans: [{ attributes, events: [{ attributes }], links: [{ attributes }] }],
				}],
			}],
		};
		for (const captureIdentity of [false, true]) {
			const normalized = normalizeAgentHostOtlpBody(Buffer.from(JSON.stringify(payload)), captureIdentity);
			const result: typeof payload = JSON.parse(normalized.body.toString());
			const resource = result.resourceSpans[0];
			const scope = resource.scopeSpans[0];
			const span = scope.spans[0];
			const expected = captureIdentity ? attributes : [attributes[3]];
			deepStrictEqual({
				resource: resource.resource.attributes,
				scope: scope.scope.attributes,
				span: span.attributes,
				event: span.events[0].attributes,
				link: span.links[0].attributes,
			}, {
				resource: [...expected, { key: 'service.namespace', value: { stringValue: 'vscode.agent-host' } }],
				scope: expected, span: expected, event: expected, link: expected,
			});
		}
	});

	for (const exporterType of ['otlp-http', 'file', 'console']) {
		for (const captureIdentity of [false, true]) {
			test(`identity ${captureIdentity}: host and ingested spans reach SQLite and ${exporterType} with the identity gate applied`, async () => {
				const saved = saveEnv();
				const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-identity-'));
				let svc: AgentHostOTelService | undefined;
				try {
					process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
					process.env.COPILOT_OTEL_CAPTURE_IDENTITY = String(!captureIdentity);
					Object.assign(process.env, buildAgentHostOTelEnv({ captureIdentity: !captureIdentity }, process.env, { captureIdentity }));
					process.env.COPILOT_OTEL_EXPORTER_TYPE = exporterType;
					process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector.invalid:4318';
					process.env.COPILOT_OTEL_FILE_EXPORTER_PATH = join(tmp, 'spans.jsonl');
					process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'false';
					process.env.OTEL_RESOURCE_ATTRIBUTES = 'host.name=synthetic-override,custom=kept';
					const exported: string[] = [];
					const log = new class extends NullLogService {
						override info(message: string): void { exported.push(message); }
					};
					let identityReads = 0;
					svc = store.add(new AgentHostOTelService({
						fetchFn: async (_input, init) => {
							exported.push(await new Response(init?.body).text());
							return new Response(null, { status: 200 });
						},
						readOSUsername: () => { identityReads++; return 'synthetic-os-user'; },
						readHostname: () => { identityReads++; return 'synthetic-host'; },
					}, log, makeEnvService(tmp)));
					const config = await svc.getSdkTelemetryConfig();
					ok(config?.otlpEndpoint);
					deepStrictEqual((await svc.getNativeSdkTelemetryConfig())?.resourceAttributes, {
						...(captureIdentity ? { 'host.name': 'synthetic-override' } : {}),
						custom: 'kept',
						'service.namespace': 'vscode.agent-host',
					});
					const context = svc.getSessionTraceContext('synthetic-conversation', 'copilot:/synthetic-session');
					ok(context);
					svc.emitSessionTitleChanged('synthetic-conversation', 'copilot:/synthetic-session', 'not-captured');
					const traceId = '1122334455667788aabbccddeeff0011';
					const spanId = '0000000000000001';
					const payload = makeOtlpRequest(traceId, spanId);
					const providerSpan = payload.resourceSpans![0].scopeSpans![0].spans![0];
					const response = await postOtlp(config.otlpEndpoint, {
						resourceSpans: [{
							resource: { attributes: [{ key: 'process.user.name', value: { stringValue: 'synthetic-provider-os' } }] },
							scopeSpans: [{
								spans: [{
									...providerSpan,
									attributes: [...providerSpan.attributes!, { key: 'user.name', value: { stringValue: 'synthetic-provider-account' } }],
									events: [{ name: 'synthetic-event', timeUnixNano: providerSpan.startTimeUnixNano, attributes: [{ key: 'host.name', value: { stringValue: 'synthetic-event-host' } }] }],
								}]
							}],
						}],
					});
					strictEqual(response.statusCode, 200);
					await svc.flush();
					if (exporterType === 'file') {
						exported.push(await readFile(process.env.COPILOT_OTEL_FILE_EXPORTER_PATH, 'utf8'));
					}
					const reader = new OTelSqliteStore(svc.getSpansDbPath()!.fsPath);
					try {
						deepStrictEqual({
							identityReads,
							hostUser: reader.getSpanAttribute(context.spanId, 'process.user.name'),
							hostName: reader.getSpanAttribute(context.spanId, 'host.name'),
							hostAccount: reader.getSpanAttribute(context.spanId, 'user.name'),
							custom: reader.getSpanAttribute(context.spanId, 'custom'),
							providerUser: reader.getSpanAttribute(spanId, 'user.name'),
							providerResource: reader.getSpanAttribute(spanId, 'process.user.name'),
							hostSpans: reader.getSpansByTraceId(context.traceId).length,
						}, {
							identityReads: captureIdentity ? 2 : 0,
							hostUser: captureIdentity ? 'synthetic-os-user' : null,
							hostName: captureIdentity ? 'synthetic-override' : null,
							hostAccount: null,
							custom: 'kept',
							providerUser: captureIdentity ? 'synthetic-provider-account' : null,
							providerResource: captureIdentity ? 'synthetic-provider-os' : null,
							hostSpans: 1,
						});
						strictEqual(JSON.stringify(reader.getSpanEvents(spanId)).includes('synthetic-event-host'), captureIdentity);
					} finally {
						reader.close();
					}
					const output = exported.join('\n');
					for (const value of ['synthetic-os-user', 'synthetic-override', 'synthetic-provider-account', 'synthetic-provider-os', 'synthetic-event-host']) {
						strictEqual(output.includes(value), captureIdentity && exporterType !== 'console', `${exporterType}: ${value}`);
					}
					strictEqual(output.includes('custom'), exporterType !== 'console');
					ok(!output.includes('not-captured'));
				} finally {
					svc?.dispose();
					restoreEnv(saved);
					await rm(tmp, { recursive: true, force: true });
				}
			});
		}
	}

	test('identity normalization failure rejects the entire payload before SQLite and external export', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-identity-rejection-'));
		let svc: AgentHostOTelService | undefined;
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			process.env.COPILOT_OTEL_CAPTURE_IDENTITY = 'false';
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector.invalid:4318';
			const exported: string[] = [];
			const warnings: string[] = [];
			svc = store.add(new AgentHostOTelService({
				fetchFn: async (_input, init) => {
					exported.push(await new Response(init?.body).text());
					return new Response(null, { status: 200 });
				},
			}, new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}, makeEnvService(tmp)));
			const config = await svc.getSdkTelemetryConfig();
			ok(config?.otlpEndpoint);
			const traceId = '1122334455667788aabbccddeeff0011';
			const spanId = '0000000000000001';
			const resourceSpan = makeOtlpRequest(traceId, spanId).resourceSpans![0];
			const payload = {
				resourceSpans: [{
					...resourceSpan,
					resource: {
						attributes: [
							...resourceSpan.resource!.attributes!,
							{ key: 'user.name', value: { stringValue: 'synthetic-private-identity' } },
						],
					},
				}],
			};
			const response = await postOtlp(config.otlpEndpoint, {
				resourceSpans: [
					...payload.resourceSpans!,
					{ resource: { attributes: { unexpected: 'synthetic-private-identity' } } },
				],
			});
			strictEqual(response.statusCode, 400);
			await svc.flush();
			strictEqual(exported.length, 0);
			strictEqual(warnings.length, 1);
			ok(!warnings[0].includes('synthetic-private-identity'));
			const reader = new OTelSqliteStore(svc.getSpansDbPath()!.fsPath);
			try {
				deepStrictEqual(reader.getSpansByTraceId(traceId), []);
				strictEqual((await postOtlp(config.otlpEndpoint, payload)).statusCode, 200);
				await svc.flush();
				strictEqual(reader.getSpansByTraceId(traceId).length, 1);
				strictEqual(reader.getSpanAttribute(spanId, 'user.name'), null);
				strictEqual(exported.length, 1);
				ok(!exported[0].includes('synthetic-private-identity'));
			} finally {
				reader.close();
			}
		} finally {
			svc?.dispose();
			restoreEnv(saved);
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('identity detection failure logs without leaking the error and preserves explicit resources', async () => {
		const saved = saveEnv();
		try {
			process.env.COPILOT_OTEL_ENABLED = 'true';
			process.env.COPILOT_OTEL_CAPTURE_IDENTITY = 'true';
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector.invalid:4318';
			process.env.OTEL_RESOURCE_ATTRIBUTES = 'process.user.name=synthetic-explicit';
			const output: string[] = [];
			const warnings: string[] = [];
			const log = new class extends NullLogService {
				override info(message: string): void { output.push(message); }
				override warn(message: string): void { warnings.push(message); }
			};
			const svc = store.add(new AgentHostOTelService({
				fetchFn: async (_input, init) => {
					output.push(await new Response(init?.body).text());
					return new Response(null, { status: 200 });
				},
				readOSUsername: () => { throw new Error('do-not-export-error'); },
				readHostname: () => 'synthetic-host',
			}, log, makeEnvService('/unused')));
			svc.getSessionTraceContext('synthetic-conversation', 'copilot:/synthetic-session');
			await svc.flush();
			strictEqual(warnings.length, 1);
			ok(!warnings[0].includes('do-not-export-error'));
			ok(output.join('\n').includes('synthetic-explicit'));
			ok(output.join('\n').includes('synthetic-host'));
		} finally {
			restoreEnv(saved);
		}
	});

	for (const explicitHostname of [undefined, 'synthetic-override']) {
		test(`hostname detection failure preserves username and explicit hostname ${explicitHostname}`, async () => {
			const saved = saveEnv();
			try {
				process.env.COPILOT_OTEL_ENABLED = 'true';
				process.env.COPILOT_OTEL_CAPTURE_IDENTITY = 'true';
				process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector.invalid:4318';
				if (explicitHostname !== undefined) {
					process.env.OTEL_RESOURCE_ATTRIBUTES = `host.name=${explicitHostname}`;
				}
				const output: string[] = [];
				const warnings: string[] = [];
				const svc = store.add(new AgentHostOTelService({
					fetchFn: async (_input, init) => {
						output.push(await new Response(init?.body).text());
						return new Response(null, { status: 200 });
					},
					readOSUsername: () => 'synthetic-user',
					readHostname: () => { throw new Error('do-not-export-error'); },
				}, new class extends NullLogService {
					override warn(message: string): void { warnings.push(message); }
				}, makeEnvService('/unused')));
				ok(svc.getSessionTraceContext('synthetic-conversation', 'copilot:/synthetic-session'));
				await svc.flush();
				strictEqual(warnings.length, 1);
				ok(!warnings[0].includes('do-not-export-error'));
				strictEqual(output.length, 1);
				const payload: IOtlpExportTraceServiceRequest = JSON.parse(output[0]);
				const attributes = payload.resourceSpans![0].resource!.attributes!;
				strictEqual(attributes.find(attribute => attribute.key === 'process.user.name')?.value?.stringValue, 'synthetic-user');
				strictEqual(attributes.find(attribute => attribute.key === 'host.name')?.value?.stringValue, explicitHostname);
				ok(!output[0].includes('do-not-export-error'));
			} finally {
				restoreEnv(saved);
			}
		});
	}

	test('identity opt-in alone neither detects identity nor starts a telemetry pipeline', async () => {
		const saved = saveEnv();
		try {
			process.env.COPILOT_OTEL_CAPTURE_IDENTITY = 'true';
			let identityReads = 0;
			const svc = store.add(new AgentHostOTelService({
				readOSUsername: () => { identityReads++; return 'synthetic-user'; },
				readHostname: () => { identityReads++; return 'synthetic-host'; },
			}, new NullLogService(), makeEnvService('/unused')));
			deepStrictEqual({
				sdk: await svc.getSdkTelemetryConfig(),
				native: await svc.getNativeSdkTelemetryConfig(),
				context: svc.getSessionTraceContext('synthetic', 'copilot:/synthetic'),
				identityReads,
			}, { sdk: undefined, native: undefined, context: undefined, identityReads: 0 });
		} finally {
			restoreEnv(saved);
		}
	});

	test('readAgentHostOTelEnv: db mode implies enabled', () => {
		const cfg = readAgentHostOTelEnv({ COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'true' });
		strictEqual(cfg.enabled, true);
		strictEqual(cfg.dbSpanExporter, true);
	});

	test('managed file paths resolve relative to Copilot home while absolute and home-prefixed paths keep their bases', async () => {
		const relativePath = join('synthetic', 'otel.jsonl');
		const userHome = URI.file(join(tmpdir(), 'synthetic-user-home')).fsPath;
		const customHome = join(tmpdir(), 'synthetic-copilot-home');
		const writerHome = join(tmpdir(), 'synthetic-writer-home');
		const absolutePath = join(tmpdir(), 'synthetic-absolute', 'otel.jsonl');
		const managedEnv = (outfile: string, extra: NodeJS.ProcessEnv = {}) => ({
			...buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile }),
			...extra,
		});
		const config = async (env: NodeJS.ProcessEnv) => {
			const service = store.add(new AgentHostOTelService({ env }, new NullLogService(), makeEnvService(join(tmpdir(), 'synthetic-user-data'), userHome)));
			return service.getSdkTelemetryConfig();
		};

		deepStrictEqual(await Promise.all([
			config(managedEnv(relativePath, { COPILOT_HOME: customHome })),
			config(managedEnv(relativePath)),
			config(managedEnv(relativePath, { COPILOT_HOME: '' })),
			config(managedEnv(absolutePath, { COPILOT_HOME: customHome })),
			config(managedEnv('~/nested/otel.jsonl', {
				COPILOT_HOME: customHome,
				...(isWindows ? { USERPROFILE: writerHome } : { HOME: writerHome }),
			})),
			config(managedEnv('~\\nested/otel.jsonl', {
				COPILOT_HOME: customHome,
				...(isWindows ? { USERPROFILE: writerHome } : { HOME: writerHome }),
			})),
		]), [
			{ exporterType: 'file', filePath: join(customHome, relativePath), otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
			{ exporterType: 'file', filePath: join(userHome, '.copilot', relativePath), otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
			{ exporterType: 'file', filePath: join(userHome, '.copilot', relativePath), otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
			{ exporterType: 'file', filePath: absolutePath, otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
			{ exporterType: 'file', filePath: join(writerHome, 'nested', 'otel.jsonl'), otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
			{ exporterType: 'file', filePath: join(writerHome, 'nested', 'otel.jsonl'), otlpEndpoint: '', sourceName: undefined, captureContent: undefined },
		]);
	});

	test('managed relative file paths reject blank or non-absolute Copilot homes without using the process CWD', async () => {
		const relativePath = join('synthetic', 'otel.jsonl');
		const cwdPath = resolve(process.cwd(), relativePath);
		const results = await Promise.all([
			['blank', '   '],
			['relative', 'relative/copilot-home'],
			['dot-relative', '.'],
		].map(async ([label, copilotHome]) => {
			const logMessages: string[] = [];
			const service = store.add(new AgentHostOTelService({
				env: {
					...buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: relativePath }),
					COPILOT_HOME: copilotHome,
				},
			}, new class extends NullLogService {
				override error(message: string): void { logMessages.push(message); }
			}, makeEnvService(join(tmpdir(), 'synthetic-user-data'), join(tmpdir(), 'synthetic-user-home'))));
			const config = await service.getSdkTelemetryConfig();
			return {
				label,
				filePath: config?.filePath,
				safeError: logMessages.length === 1 && logMessages[0].startsWith('[agentHost.otel] ignored managed file export path:'),
				usedCwd: config?.filePath === cwdPath,
			};
		}));

		deepStrictEqual(results, [
			{ label: 'blank', filePath: '', safeError: true, usedCwd: false },
			{ label: 'relative', filePath: '', safeError: true, usedCwd: false },
			{ label: 'dot-relative', filePath: '', safeError: true, usedCwd: false },
		]);
	});

	test('managed file path rejects invalid paths without disabling DB export', () => {
		const home = isWindows ? 'C:\\synthetic-writer-home' : '/synthetic-writer-home';
		const homeEnv = isWindows ? { USERPROFILE: home } : { HOME: home };
		for (const path of ['', ' ', '~', '~/', '~\\', '.', '..', '${HOME}/otel.jsonl', '%USERPROFILE%\\otel.jsonl', 'prefix${HOME}/trace', 'prefix$HOME/trace', 'prefix%HOME%/trace', '~named/otel.jsonl', 'directory/', 'directory/.', 'directory/..']) {
			const cfg = readAgentHostOTelEnv({
				...homeEnv,
				...buildAgentHostOTelEnv({ dbSpanExporterEnabled: true }, {}, { enabled: true, exporterType: 'file', outfile: path }),
			});
			deepStrictEqual({
				enabled: cfg.enabled,
				dbSpanExporter: cfg.dbSpanExporter,
				exporterType: cfg.exporterType,
				filePath: cfg.filePath,
			}, {
				enabled: true,
				dbSpanExporter: true,
				exporterType: 'file',
				filePath: undefined,
			}, `expected invalid managed file path ${JSON.stringify(path)} to be rejected`);
		}
	});

	test('managed file path requires a non-blank platform writer-home variable', () => {
		const otherHomeEnv = isWindows ? { HOME: '/synthetic-other-home' } : { USERPROFILE: 'C:\\synthetic-other-home' };
		const blankHomeEnv = isWindows ? { USERPROFILE: '   ' } : { HOME: '   ' };
		for (const env of [otherHomeEnv, blankHomeEnv]) {
			const cfg = readAgentHostOTelEnv({
				...env,
				...buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: '~/nested/otel.jsonl' }),
			});
			deepStrictEqual({
				enabled: cfg.enabled,
				dbSpanExporter: cfg.dbSpanExporter,
				exporterType: cfg.exporterType,
				filePath: cfg.filePath,
			}, {
				enabled: true,
				dbSpanExporter: false,
				exporterType: 'file',
				filePath: undefined,
			});
		}
	});

	test('managed file marker without a path is rejected and logged without the path value', async () => {
		const logMessages: string[] = [];
		const env = {
			COPILOT_OTEL_ENABLED: 'true',
			COPILOT_OTEL_EXPORTER_TYPE: 'file',
			[AgentHostOTelEnvVars.FilePathIsManaged]: 'true',
		};
		const cfg = readAgentHostOTelEnv(env);
		strictEqual(cfg.filePath, undefined);
		strictEqual(cfg.filePathError, 'path is empty');

		const service = store.add(new AgentHostOTelService({ env }, new class extends NullLogService {
			override error(message: string): void { logMessages.push(message); }
		}, makeEnvService(tmpdir())));
		deepStrictEqual(await service.getSdkTelemetryConfig(), {
			exporterType: 'file',
			filePath: '',
			otlpEndpoint: undefined,
			sourceName: undefined,
			captureContent: undefined,
		});
		deepStrictEqual(logMessages, ['[agentHost.otel] ignored managed file export path: path is empty']);
	});

	test('managed file path does not alter unmanaged paths or a managed disable', () => {
		const unmanaged = readAgentHostOTelEnv({
			COPILOT_OTEL_ENABLED: 'true',
			COPILOT_OTEL_EXPORTER_TYPE: 'file',
			COPILOT_OTEL_FILE_EXPORTER_PATH: 'synthetic/otel.jsonl',
		});
		const managedDisabled = readAgentHostOTelEnv(buildAgentHostOTelEnv({ dbSpanExporterEnabled: true }, {}, { enabled: false }));
		deepStrictEqual({
			enabled: unmanaged.enabled,
			dbSpanExporter: unmanaged.dbSpanExporter,
			exporterType: unmanaged.exporterType,
			filePath: unmanaged.filePath,
		}, {
			enabled: true,
			dbSpanExporter: false,
			exporterType: 'file',
			filePath: 'synthetic/otel.jsonl',
		});
		deepStrictEqual({
			enabled: managedDisabled.enabled,
			dbSpanExporter: managedDisabled.dbSpanExporter,
		}, {
			enabled: false,
			dbSpanExporter: false,
		});
	});

	test('managed file path provenance validates service configuration without mutating process environment', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-managed-file-'));
		const services = new DisposableStore();
		const home = join(tmp, 'home');
		const homeEnv = isWindows ? { USERPROFILE: home } : { HOME: home };
		const managedFileEnv = {
			...homeEnv,
			...buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: '~/spans.jsonl' }),
		};
		const logMessages: string[] = [];
		let fetchCalls = 0;
		try {
			const fileService = services.add(new AgentHostOTelService({
				env: managedFileEnv,
				fetchFn: async () => {
					fetchCalls++;
					return new Response(null, { status: 200 });
				},
			}, new NullLogService(), makeEnvService(tmp)));
			ok(fileService.getSessionTraceContext('managed-file', 'copilot:/managed-file'));
			await fileService.flush();
			ok((await readFile(join(home, 'spans.jsonl'), 'utf8')).includes(AgentHostSessionSpanName));

			const missingHomeService = services.add(new AgentHostOTelService({
				env: buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: '~/spans.jsonl' }),
			}, new class extends NullLogService {
				override error(message: string): void { logMessages.push(message); }
			}, makeEnvService(tmp)));
			deepStrictEqual(await missingHomeService.getSdkTelemetryConfig(), {
				exporterType: 'file',
				filePath: '',
				otlpEndpoint: undefined,
				sourceName: undefined,
				captureContent: undefined,
			});
			strictEqual(logMessages.length, 1);

			const dbService = services.add(new AgentHostOTelService({
				env: buildAgentHostOTelEnv({ dbSpanExporterEnabled: true }, {}, { enabled: true, exporterType: 'file', outfile: '~' }),
				fetchFn: async () => {
					fetchCalls++;
					return new Response(null, { status: 200 });
				},
			}, new NullLogService(), makeEnvService(tmp)));
			const dbConfig = await dbService.getSdkTelemetryConfig();
			ok(dbConfig?.otlpEndpoint?.startsWith('http://127.0.0.1:'));
			strictEqual(dbConfig?.filePath, '');
			ok(dbService.getSessionTraceContext('invalid-file', 'copilot:/invalid-file'));
			await dbService.flush();
			const dbPath = dbService.getSpansDbPath();
			ok(dbPath);
			const reader = new OTelSqliteStore(dbPath!.fsPath);
			try {
				strictEqual(reader.getSpansByConversationId('invalid-file').length, 1);
			} finally {
				reader.close();
			}
			strictEqual(fetchCalls, 0);
		} finally {
			services.dispose();
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('rejected managed file paths retain the empty child override when DB startup fails', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-managed-file-failure-'));
		const userDataPath = join(tmp, 'not-a-directory');
		await writeFile(userDataPath, '');
		const service = store.add(new AgentHostOTelService({
			env: buildAgentHostOTelEnv(
				{ dbSpanExporterEnabled: true },
				{},
				{ enabled: true, exporterType: 'file', outfile: 'synthetic-customer-user-directory/' },
			),
		}, new NullLogService(), makeEnvService(userDataPath)));
		try {
			deepStrictEqual(await service.getSdkTelemetryConfig(), {
				exporterType: 'file',
				filePath: '',
				otlpEndpoint: undefined,
				sourceName: undefined,
				captureContent: undefined,
			});
		} finally {
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('managed collector and file keep distinct host session records in SQLite while using their selected forwarder', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-managed-routing-'));
		const services = new DisposableStore();
		const collectorBodies: string[] = [];
		const collectorUrls: string[] = [];
		try {
			const cases = [
				{
					conversationId: 'managed-collector-conversation',
					sessionUri: 'copilot:/managed-collector-session',
					env: buildAgentHostOTelEnv(
						{ dbSpanExporterEnabled: true, otlpEndpoint: 'http://user-receiver.invalid:4318' },
						{},
						{ enabled: true, exporterType: 'otlp-http', otlpEndpoint: 'http://managed-collector.invalid:4318', otlpProtocol: 'http/json' },
					),
					usesCollector: true,
				},
				{
					conversationId: 'managed-file-conversation',
					sessionUri: 'copilot:/managed-file-session',
					env: buildAgentHostOTelEnv(
						{ dbSpanExporterEnabled: true, otlpEndpoint: 'http://user-receiver.invalid:4318' },
						{},
						{ enabled: true, exporterType: 'file', outfile: join(tmp, 'managed-spans.jsonl') },
					),
					usesCollector: false,
				},
			];
			for (const testCase of cases) {
				const userDataPath = join(tmp, testCase.conversationId);
				const svc = services.add(new AgentHostOTelService({
					env: testCase.env,
					fetchFn: async (input, init) => {
						collectorUrls.push(String(input));
						collectorBodies.push(await new Response(init?.body).text());
						return new Response(null, { status: 200 });
					},
				}, new NullLogService(), makeEnvService(userDataPath)));

				const context = svc.getSessionTraceContext(testCase.conversationId, testCase.sessionUri);
				ok(context);
				await svc.flush();

				const dbPath = svc.getSpansDbPath();
				ok(dbPath);
				const reader = new OTelSqliteStore(dbPath.fsPath);
				try {
					const spans = reader.getSpansByConversationId(testCase.conversationId);
					strictEqual(spans.length, 1);
					strictEqual(spans[0].name, AgentHostSessionSpanName);
					strictEqual(reader.getSpanAttribute(spans[0].span_id, 'gen_ai.conversation.id'), testCase.conversationId);
					strictEqual(reader.getSpanAttribute(spans[0].span_id, AgentHostSessionUriAttribute), testCase.sessionUri);
				} finally {
					reader.close();
				}

				if (testCase.usesCollector) {
					strictEqual(collectorBodies.length, 1);
					deepStrictEqual(collectorUrls, ['http://managed-collector.invalid:4318/v1/traces']);
					const payload: IOtlpExportTraceServiceRequest = JSON.parse(collectorBodies[0]);
					const forwardedSpans = payload.resourceSpans?.flatMap(resourceSpan => resourceSpan.scopeSpans?.flatMap(scopeSpan => scopeSpan.spans ?? []) ?? []) ?? [];
					strictEqual(forwardedSpans.length, 1);
					strictEqual(forwardedSpans[0].name, AgentHostSessionSpanName);
					strictEqual(forwardedSpans[0].attributes?.find(attribute => attribute.key === 'gen_ai.conversation.id')?.value?.stringValue, testCase.conversationId);
				} else {
					const output = await readFile(join(tmp, 'managed-spans.jsonl'), 'utf8');
					const records: ICompletedSpanData[] = output.trim().split('\n').map(line => JSON.parse(line));
					strictEqual(records.length, 1);
					deepStrictEqual({
						name: records[0].name,
						conversationId: records[0].attributes['gen_ai.conversation.id'],
						sessionUri: records[0].attributes[AgentHostSessionUriAttribute],
					}, {
						name: AgentHostSessionSpanName,
						conversationId: testCase.conversationId,
						sessionUri: testCase.sessionUri,
					});
					strictEqual(collectorBodies.length, 1);
					deepStrictEqual(collectorUrls, ['http://managed-collector.invalid:4318/v1/traces']);
				}
			}
		} finally {
			services.dispose();
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('managed valid and invalid file paths do not create a SQLite database when DB export is off', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-managed-file-db-off-'));
		const services = new DisposableStore();
		try {
			const cases = [
				{
					name: 'valid-file',
					env: buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: join(tmp, 'spans.jsonl') }),
				},
				{
					name: 'invalid-file',
					env: buildAgentHostOTelEnv({}, {}, { enabled: true, exporterType: 'file', outfile: '~' }),
				},
			];
			for (const testCase of cases) {
				const userDataPath = join(tmp, testCase.name);
				const svc = services.add(new AgentHostOTelService({ env: testCase.env }, new NullLogService(), makeEnvService(userDataPath)));
				ok(svc.getSessionTraceContext(`${testCase.name}-conversation`, `copilot:/${testCase.name}-session`));
				await svc.flush();
				strictEqual(svc.getSpansDbPath(), undefined);
				await rejects(access(join(userDataPath, AgentHostOTelSpansDbSubPath)), { code: 'ENOENT' });
			}
		} finally {
			services.dispose();
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('scope-fix file parent creation is managed-only with DB off and on', async () => {
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-managed-parent-'));
		const services = new DisposableStore();
		let collectorCalls = 0;
		try {
			for (const dbSpanExporterEnabled of [false, true]) {
				for (const managed of [false, true]) {
					const kind = managed ? 'managed' : 'personal';
					const outputPath = join(tmp, kind, String(dbSpanExporterEnabled), 'nested', 'spans.jsonl');
					const warnings: string[] = [];
					const env = managed
						? buildAgentHostOTelEnv(
							{ dbSpanExporterEnabled },
							{},
							{ enabled: true, exporterType: 'file', outfile: outputPath },
						)
						: buildAgentHostOTelEnv(
							{ enabled: true, exporterType: 'file', outfile: outputPath, dbSpanExporterEnabled },
							{},
						);
					const service = services.add(new AgentHostOTelService({
						env,
						fetchFn: async () => {
							collectorCalls++;
							return new Response(null, { status: 200 });
						},
					}, new class extends NullLogService {
						override warn(message: string): void { warnings.push(message); }
					}, makeEnvService(join(tmp, 'user-data', kind, String(dbSpanExporterEnabled)))));

					ok(service.getSessionTraceContext(`${kind}-${dbSpanExporterEnabled}`, `copilot:/${kind}-${dbSpanExporterEnabled}`));
					await service.flush();

					if (managed) {
						ok((await readFile(outputPath, 'utf8')).includes(AgentHostSessionSpanName));
					} else {
						await rejects(access(outputPath));
						await rejects(access(join(tmp, kind, String(dbSpanExporterEnabled), 'nested')));
						deepStrictEqual({
							count: warnings.length,
							hasOperation: warnings.some(message => message.includes('append')),
							hasCode: warnings.some(message => /\bcode=E[A-Z0-9_]+\b/.test(message)),
							exposesOutputPath: warnings.some(message => message.includes(outputPath)),
							exposesUniquePathComponent: warnings.some(message => message.includes(tmp)),
							exposesRawMessage: warnings.some(message => message.includes('no such file')),
						}, {
							count: 1,
							hasOperation: true,
							hasCode: true,
							exposesOutputPath: false,
							exposesUniquePathComponent: false,
							exposesRawMessage: false,
						});
					}
					strictEqual(service.getSpansDbPath() !== undefined, dbSpanExporterEnabled);
				}
			}
			strictEqual(collectorCalls, 0);
		} finally {
			services.dispose();
			await rm(tmp, { recursive: true, force: true });
		}
	});

	test('readAgentHostOTelEnv: grpc aliases select the gRPC exporter type', () => {
		for (const protocol of ['grpc', 'http/grpc']) {
			const cfg = readAgentHostOTelEnv({
				COPILOT_OTEL_ENABLED: 'true',
				COPILOT_OTEL_EXPORTER_TYPE: 'otlp-http',
				OTEL_EXPORTER_OTLP_PROTOCOL: protocol,
			});
			strictEqual(cfg.exporterType, 'otlp-grpc');
		}
	});

	test('readAgentHostOTelEnv: parses headers and resource attributes', () => {
		const cfg = readAgentHostOTelEnv({
			COPILOT_OTEL_ENABLED: 'true',
			OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer%20xyz,x-tenant=acme%2Fprod',
			OTEL_RESOURCE_ATTRIBUTES: 'deployment.environment.name=dev,custom=value%20with%20spaces,service.name=ignored,service.namespace=foreign',
			OTEL_SERVICE_NAME: 'agent-host',
		});
		deepStrictEqual({ headers: cfg.headers, resourceAttributes: cfg.resourceAttributes }, {
			headers: { authorization: 'Bearer xyz', 'x-tenant': 'acme/prod' },
			resourceAttributes: {
				'deployment.environment.name': 'dev',
				custom: 'value with spaces',
				'service.name': 'agent-host',
				'service.namespace': 'vscode.agent-host',
			},
		});
	});

	test('normalizes resources and narrowly filters Codex 0.142 auth polling spans', () => {
		const payload = {
			resourceSpans: [
				{
					resource: {
						attributes: [
							{ key: 'service.name', value: { stringValue: 'codex-app-server' } },
							{ key: 'service.namespace', value: { stringValue: 'foreign' } },
							{ key: 'deployment.environment.name', value: { stringValue: 'test' } },
						]
					},
					scopeSpans: [
						{
							spans: [
								{ name: 'auth', attributes: [{ key: 'code.module.name', value: { stringValue: 'codex_login::auth::manager' } }] },
								{ name: 'auth', attributes: [{ key: 'code.module.name', value: { stringValue: 'other::module' } }] },
								{ name: 'list_models', attributes: [] },
							]
						},
						{ spans: [] },
						{ spans: [{ name: 'auth', attributes: [{ key: 'code.module.name', value: { stringValue: 'codex_login::auth::manager' } }] }] },
					],
				},
				{
					resource: { attributes: [{ key: 'service.name', value: { stringValue: 'another-service' } }] },
					scopeSpans: [{ spans: [{ name: 'auth', attributes: [{ key: 'code.module.name', value: { stringValue: 'codex_login::auth::manager' } }] }] }],
				},
				{ resource: { attributes: [{ key: 'custom', value: { stringValue: 'kept' } }] }, scopeSpans: [] },
			],
		};

		const normalized = normalizeAgentHostOtlpBody(Buffer.from(JSON.stringify(payload)));
		const result = JSON.parse(normalized.body.toString('utf8')) as typeof payload;
		strictEqual(normalized.filteredSpanCount, 2);
		deepStrictEqual(result.resourceSpans[0].scopeSpans[0].spans.map(span => span.name), ['auth', 'list_models']);
		deepStrictEqual(result.resourceSpans[0].scopeSpans[1].spans, []);
		deepStrictEqual(result.resourceSpans[0].scopeSpans[2].spans, []);
		strictEqual(result.resourceSpans[1].scopeSpans[0].spans.length, 1);
		ok(result.resourceSpans[0].resource.attributes.some(attribute => attribute.key === 'deployment.environment.name' && attribute.value.stringValue === 'test'));
		ok(result.resourceSpans.every(resourceSpan => resourceSpan.resource.attributes.some(attribute => attribute.key === 'service.namespace' && attribute.value.stringValue === 'vscode.agent-host')));
	});

	test('getSdkTelemetryConfig: returns undefined when fully disabled', async () => {
		const saved = saveEnv();
		try {
			const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
			store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));
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
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

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

	for (const protocol of ['http/json', 'http/protobuf', 'grpc'] as const) {
		test(`native SDK config resolves trace endpoints without changing other signals (${protocol})`, async () => {
			const saved = saveEnv();
			try {
				process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
				process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Bearer%20test-token';
				const di = store.add(new TestInstantiationService());
				di.set(ILogService, new NullLogService());
				di.set(INativeEnvironmentService, makeEnvService(tmpdir()));

				const endpoints = [
					['http://collector:4318', 'http://collector:4318/v1/traces'],
					['http://collector:4318/', 'http://collector:4318/v1/traces'],
					['https://collector/?tenant=test', 'https://collector/v1/traces?tenant=test'],
					['http://collector:4318/v1/traces', 'http://collector:4318/v1/traces'],
					['http://collector:4318/custom/path', 'http://collector:4318/custom/path'],
					['not a url', 'not a url'],
				];
				const actual = [];
				const expected = [];
				for (const [endpoint, tracesEndpoint] of endpoints) {
					process.env.OTEL_EXPORTER_OTLP_ENDPOINT = endpoint;
					const svc = store.add(di.createInstance(AgentHostOTelService, undefined));
					const native = await svc.getNativeSdkTelemetryConfig();
					const sdk = await svc.getSdkTelemetryConfig();
					actual.push({ traces: native?.traces, external: native?.external, sdkEndpoint: sdk?.otlpEndpoint });
					expected.push({
						traces: { endpoint: protocol === 'grpc' ? endpoint : tracesEndpoint, protocol, headers: { Authorization: 'Bearer test-token' } },
						external: { endpoint, protocol, headers: { Authorization: 'Bearer test-token' } },
						sdkEndpoint: endpoint,
					});
				}
				deepStrictEqual(actual, expected);
			} finally {
				restoreEnv(saved);
			}
		});
	}

	test('external-only unsupported synthetic protocols do not propagate a missing anchor', async () => {
		const saved = saveEnv();
		try {
			for (const protocol of ['http/protobuf', 'grpc', 'http/grpc']) {
				process.env.COPILOT_OTEL_ENABLED = 'true';
				process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
				process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
				const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
				store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });
				const di = store.add(new TestInstantiationService());
				di.set(ILogService, new NullLogService());
				di.set(INativeEnvironmentService, makeEnvService(tmp));
				const svc = store.add(di.createInstance(AgentHostOTelService, undefined));
				const config = await svc.getNativeSdkTelemetryConfig();
				strictEqual(config?.external?.protocol, protocol === 'http/grpc' ? 'grpc' : protocol);
				strictEqual(svc.getSessionTraceContext('conversation', `claude:/${protocol}`), undefined);
			}
		} finally {
			restoreEnv(saved);
		}
	});

	test('session trace contexts are stable until permanent release', () => {
		const saved = saveEnv();
		try {
			process.env.COPILOT_OTEL_ENABLED = 'true';
			process.env.COPILOT_OTEL_EXPORTER_TYPE = 'console';
			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmpdir()));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));
			const first = svc.getSessionTraceContext('conversation', 'claude:/conversation');
			strictEqual(svc.getSessionTraceContext('conversation', 'claude:/conversation'), first);
			svc.releaseSessionTraceContext('claude:/conversation');
			notStrictEqual(svc.getSessionTraceContext('conversation', 'claude:/conversation'), first);
		} finally {
			restoreEnv(saved);
		}
	});

	test('native SDK config splits DB traces from direct external signals', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
			process.env.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/protobuf';
			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

			const config = await svc.getNativeSdkTelemetryConfig();
			ok(config?.traces?.endpoint.startsWith('http://127.0.0.1:'));
			strictEqual(config?.traces?.protocol, 'http/json');
			deepStrictEqual(config?.external, { endpoint: 'http://collector:4318', protocol: 'http/protobuf' });
			deepStrictEqual(config?.resourceAttributes, { 'service.namespace': 'vscode.agent-host' });
			const context = svc.getSessionTraceContext('conversation', 'claude:/conversation');
			ok(context);
			strictEqual(context.traceparent, `00-${context.traceId}-${context.spanId}-01`);
			strictEqual(svc.withTraceContext(context, () => svc.getCurrentTraceContext()), context);
			strictEqual(svc.getCurrentTraceContext(), undefined);
		} finally {
			restoreEnv(saved);
		}
	});

	test('DB startup failure falls back to a signal-specific native trace endpoint', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });
		try {
			const userDataPath = join(tmp, 'not-a-directory');
			await writeFile(userDataPath, '');
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(userDataPath));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

			const config = await svc.getNativeSdkTelemetryConfig();
			deepStrictEqual({ traces: config?.traces, external: config?.external }, {
				traces: { endpoint: 'http://collector:4318/v1/traces', protocol: 'http/json' },
				external: { endpoint: 'http://collector:4318', protocol: 'http/json' },
			});
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
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

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

	test('DB mode: adds bounded comparison metadata to the session anchor', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

			await svc.getSdkTelemetryConfig();
			svc.setSessionComparisonMetadata('claude:/attempt', {
				id: 'comparison-id',
				role: 'attempt',
				attemptIndex: 1,
				attemptCount: 3,
			});
			svc.getSessionTraceContext('conversation', 'claude:/attempt');
			await svc.flush();

			const dbPath = svc.getSpansDbPath();
			ok(dbPath);
			const reader = new OTelSqliteStore(dbPath!.fsPath);
			try {
				const anchor = reader.getSpansByConversationId('conversation').find(span => span.name === AgentHostSessionSpanName);
				ok(anchor);
				deepStrictEqual({
					comparisonId: reader.getSpanAttribute(anchor.span_id, AgentHostComparisonIdAttribute),
					role: reader.getSpanAttribute(anchor.span_id, AgentHostComparisonRoleAttribute),
					attemptIndex: reader.getSpanAttribute(anchor.span_id, AgentHostComparisonAttemptIndexAttribute),
					attemptCount: reader.getSpanAttribute(anchor.span_id, AgentHostComparisonAttemptCountAttribute),
				}, {
					comparisonId: 'comparison-id',
					role: 'attempt',
					attemptIndex: '1',
					attemptCount: '3',
				});
			} finally {
				reader.close();
			}
		} finally {
			restoreEnv(saved);
			await cleanup();
		}
	});

	test('DB mode: emits session title metadata spans when content capture is enabled', async () => {
		const saved = saveEnv();
		const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
		const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => undefined);
		try {
			process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
			process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = 'true';
			process.env.OTEL_SERVICE_NAME = 'agent-host-test';

			const di = store.add(new TestInstantiationService());
			di.set(ILogService, new NullLogService());
			di.set(INativeEnvironmentService, makeEnvService(tmp));
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

			await svc.getSdkTelemetryConfig();
			svc.emitSessionTitleChanged('conv-title', 'copilotcli:/conv-title', `Updated title ${'x'.repeat(300)}`);
			await svc.flush();

			const dbPath = svc.getSpansDbPath();
			ok(dbPath);
			const reader = new OTelSqliteStore(dbPath!.fsPath);
			try {
				const spans = reader.getSpansByConversationId('conv-title');
				strictEqual(spans.length, 2);
				const titleSpan = spans.find(span => span.name === AgentHostSessionTitleSpanName);
				ok(titleSpan);
				strictEqual(reader.getSpanAttribute(titleSpan.span_id, AgentHostSessionTitleAttribute)?.length, 200);
				strictEqual(reader.getSpanAttribute(titleSpan.span_id, AgentHostSessionUriAttribute), 'copilotcli:/conv-title');
				strictEqual(reader.getSpanAttribute(titleSpan.span_id, 'service.name'), 'agent-host-test');
				strictEqual(reader.getSpanAttribute(titleSpan.span_id, 'service.namespace'), 'vscode.agent-host');
			} finally {
				reader.close();
			}
		} finally {
			restoreEnv(saved);
			await cleanup();
		}
	});

	test('DB mode keeps protobuf and gRPC traces local instead of HTTP-posting the wrong wire format', async () => {
		const saved = saveEnv();
		try {
			for (const protocol of ['http/protobuf', 'grpc']) {
				process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = 'true';
				process.env.COPILOT_OTEL_EXPORTER_TYPE = protocol === 'grpc' ? 'otlp-grpc' : 'otlp-http';
				process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
				process.env.OTEL_EXPORTER_OTLP_PROTOCOL = protocol;
				let fetchCalls = 0;
				const tmp = await mkdtemp(join(tmpdir(), 'vscode-otel-svc-'));
				store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => undefined) });
				const di = store.add(new TestInstantiationService());
				di.set(ILogService, new NullLogService());
				di.set(INativeEnvironmentService, makeEnvService(tmp));
				const svc = store.add(di.createInstance(AgentHostOTelService, {
					fetchFn: async () => {
						fetchCalls++;
						return new Response(null, { status: 200 });
					},
				}));
				const config = await svc.getSdkTelemetryConfig();
				const res = await postOtlp(config!.otlpEndpoint!, makeOtlpRequest('ffeeddccbbaa99887766554433221100', '00000000000000aa'));
				strictEqual(res.statusCode, 200);
				await svc.flush();
				strictEqual(fetchCalls, 0);
			}
		} finally {
			restoreEnv(saved);
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
			const svc = store.add(di.createInstance(AgentHostOTelService, undefined));

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
