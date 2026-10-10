/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import type * as http from 'http';
import { createRequire } from 'module';
import { gunzipSync } from 'zlib';
import { retry } from '../../../../../../base/common/async.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostSessionSpanName } from '../../../../common/otel/agentHostOTelService.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType, type ChatErrorAction, type ChatToolCallCompleteAction, type ChatToolCallContentChangedAction, type ChatToolCallStartAction } from '../../../../common/state/sessionActions.js';
import { buildDefaultChatUri, getErrorResponsePart, MessageKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type ChatState, type ToolResultSubagentContent } from '../../../../common/state/sessionState.js';
import { fetchSessionWithChat, getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { createRealSession, driveTurnWithModelToCompletion, removeTempDirs, textFromContent } from '../harness/agentHostE2ETestHarness.js';
import { summarizeAnthropicRequest } from '../harness/capiWireCodec.js';
import type { IAgentHostE2ETestContext } from './e2eTestContext.js';

const nodeRequire = createRequire(import.meta.url);
const httpModule = nodeRequire('http') as typeof http;
const model = 'claude-sonnet-5';
const RECORD = process.env.AGENT_HOST_REPLAY_RECORD === '1' || process.env.AGENT_HOST_UPDATE_SNAPSHOTS === '1';
const fileContent = 'SYNTHETIC_TELEMETRY_FILE\n';
const caseAttribute = 'runtime.telemetry.case';
const contentAttributes = ['gen_ai.input.messages', 'gen_ai.output.messages', 'gen_ai.system_instructions', 'gen_ai.tool.definitions', 'gen_ai.tool.call.arguments', 'gen_ai.tool.call.result'] as const;

type AttributeValue = string | number | boolean | readonly AttributeValue[];
type Attributes = Readonly<Record<string, AttributeValue>>;

interface IOtlpValue {
	readonly stringValue?: string;
	readonly boolValue?: boolean;
	readonly intValue?: string | number;
	readonly doubleValue?: number;
	readonly arrayValue?: { readonly values?: readonly IOtlpValue[] };
}

interface IOtlpAttribute {
	readonly key: string;
	readonly value: IOtlpValue;
}

interface ISpan {
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly parentSpanId?: string;
	readonly attributes: Attributes;
	readonly resource: Attributes;
	readonly scope: string;
	readonly statusCode: number;
	readonly events: readonly { readonly name: string; readonly attributes: Attributes }[];
}

interface IOtlpSpan {
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly parentSpanId?: string;
	readonly attributes?: readonly IOtlpAttribute[];
	readonly status?: { readonly code?: number };
	readonly events?: readonly { readonly name: string; readonly attributes?: readonly IOtlpAttribute[] }[];
}

interface ITraceExport {
	readonly resourceSpans?: readonly {
		readonly resource?: { readonly attributes?: readonly IOtlpAttribute[] };
		readonly scopeSpans?: readonly { readonly scope?: { readonly name?: string }; readonly spans?: readonly IOtlpSpan[] }[];
	}[];
}

interface IMetricPoint {
	readonly attributes?: readonly IOtlpAttribute[];
	readonly asInt?: string | number;
	readonly asDouble?: number;
	readonly count?: string | number;
}

interface IMetricExport {
	readonly resourceMetrics?: readonly {
		readonly resource?: { readonly attributes?: readonly IOtlpAttribute[] };
		readonly scopeMetrics?: readonly {
			readonly scope?: { readonly name?: string };
			readonly metrics?: readonly {
				readonly name: string;
				readonly sum?: { readonly dataPoints?: readonly IMetricPoint[] };
				readonly histogram?: { readonly dataPoints?: readonly IMetricPoint[] };
			}[];
		}[];
	}[];
}

interface IExportRequest {
	readonly method: string | undefined;
	readonly path: string;
	readonly contentType: string;
	readonly routingHeader: string | undefined;
	readonly body: string;
}

interface IFileSpan {
	readonly type: string;
	readonly name: string;
	readonly traceId: string;
	readonly spanId: string;
	readonly parentSpanId?: string;
	readonly attributes: Attributes;
	readonly resource: { readonly attributes: Attributes };
	readonly instrumentationScope: { readonly name: string };
	readonly status: { readonly code: number };
	readonly events: readonly { readonly name: string; readonly attributes: Attributes }[];
}

interface ITelemetryCase {
	readonly id: string;
	readonly title: string;
	readonly capture: boolean;
	readonly exporter?: 'file';
	readonly header?: boolean;
	run(session: ITelemetrySession): Promise<void>;
}

interface ITelemetrySession {
	readonly uri: string;
	readonly file: string;
	readonly exportFile: string;
	readonly testCase: ITelemetryCase;
	readonly tools: ChatToolCallCompleteAction[];
	turn(id: string, prompt: string): Promise<void>;
	fail(id: string): Promise<void>;
	read(id: string, missing?: boolean): Promise<ChatToolCallCompleteAction>;
	closeAndFlush(): Promise<void>;
	spans(): readonly ISpan[];
}

function valueFromOtlp(value: IOtlpValue): AttributeValue {
	if (value.stringValue !== undefined) {
		return value.stringValue;
	}
	if (value.boolValue !== undefined) {
		return value.boolValue;
	}
	if (value.intValue !== undefined) {
		const parsed = Number(value.intValue);
		assert.ok(Number.isFinite(parsed), 'OTLP integer attributes must be numeric');
		return parsed;
	}
	if (value.doubleValue !== undefined) {
		return value.doubleValue;
	}
	if (value.arrayValue) {
		return (value.arrayValue.values ?? []).map(valueFromOtlp);
	}
	throw new Error('Unsupported OTLP attribute value');
}

function attributesFromOtlp(attributes: readonly IOtlpAttribute[] = []): Attributes {
	return Object.fromEntries(attributes.map(attribute => [attribute.key, valueFromOtlp(attribute.value)]));
}

function operation(span: ISpan): AttributeValue | undefined {
	return span.attributes['gen_ai.operation.name'];
}

function isDescendant(span: ISpan, ancestor: ISpan, spans: readonly ISpan[]): boolean {
	const visited = new Set<string>();
	let parent = span.parentSpanId;
	while (parent && !visited.has(parent)) {
		if (parent === ancestor.spanId) {
			return span.traceId === ancestor.traceId;
		}
		visited.add(parent);
		parent = spans.find(candidate => candidate.spanId === parent)?.parentSpanId;
	}
	return false;
}

class RuntimeOtlpCollector extends Disposable {
	readonly requests: IExportRequest[] = [];
	private readonly server: http.Server;
	private readonly closed: Promise<void>;
	private baseUrl = '';

	constructor() {
		super();
		this.server = httpModule.createServer((request, response) => {
			const chunks: Buffer[] = [];
			request.on('data', chunk => chunks.push(chunk));
			request.on('error', error => response.destroy(error));
			request.on('end', () => {
				const path = request.url ?? '/';
				const bytes = Buffer.concat(chunks);
				const body = request.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes;
				const routingHeader = request.headers['x-runtime-telemetry'];
				this.requests.push({
					method: request.method, path,
					contentType: request.headers['content-type'] ?? '',
					routingHeader: typeof routingHeader === 'string' ? routingHeader : undefined,
					body: body.toString('utf8'),
				});
				response.writeHead(request.method === 'POST' && /\/v1\/(?:traces|metrics)$/.test(path) ? 200 : 404, { 'content-type': 'application/json' });
				response.end('{}');
			});
		});
		this.closed = new Promise<void>(resolve => {
			this._register(toDisposable(() => {
				this.server.close(() => resolve());
				this.server.closeAllConnections();
			}));
		});
	}

	get url(): string {
		assert.ok(this.baseUrl, 'The OTLP collector must be listening');
		return this.baseUrl;
	}

	async start(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			const onError = (error: Error) => {
				this.server.off('listening', onListening);
				reject(error);
			};
			const onListening = () => {
				this.server.off('error', onError);
				resolve();
			};
			this.server.once('error', onError);
			this.server.once('listening', onListening);
			this.server.listen(0, '127.0.0.1');
		});
		const address = this.server.address();
		assert.ok(address && typeof address !== 'string');
		this.baseUrl = `http://127.0.0.1:${address.port}`;
	}

	async whenClosed(): Promise<void> {
		await this.closed;
	}

	caseRequests(id: string, signal: 'traces' | 'metrics'): readonly IExportRequest[] {
		const requests = this.requests.filter(request => request.path === `/${id}/v1/${signal}`);
		for (const request of requests) {
			assert.strictEqual(request.method, 'POST');
			assert.ok(request.contentType.startsWith('application/json'), `Expected OTLP/HTTP JSON, got ${request.contentType}`);
		}
		return requests;
	}

	spans(id: string): readonly ISpan[] {
		return this.caseRequests(id, 'traces').flatMap(request => {
			const payload = JSON.parse(request.body) as ITraceExport;
			return (payload.resourceSpans ?? []).flatMap(resource =>
				(resource.scopeSpans ?? []).flatMap(scope =>
					(scope.spans ?? []).map(span => ({
						name: span.name, traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId,
						attributes: attributesFromOtlp(span.attributes), resource: attributesFromOtlp(resource.resource?.attributes),
						scope: scope.scope?.name ?? '', statusCode: span.status?.code ?? 0,
						events: (span.events ?? []).map(event => ({ name: event.name, attributes: attributesFromOtlp(event.attributes) })),
					}))));
		});
	}

	metricPoints(id: string, name: string): readonly { readonly attributes: Attributes; readonly value: number }[] {
		return this.caseRequests(id, 'metrics').flatMap(request => {
			const payload = JSON.parse(request.body) as IMetricExport;
			return (payload.resourceMetrics ?? []).filter(resource => attributesFromOtlp(resource.resource?.attributes)['service.name'] === 'github-copilot')
				.flatMap(resource => (resource.scopeMetrics ?? []).filter(scope => scope.scope?.name === `runtime.telemetry.${id}`)
					.flatMap(scope => (scope.metrics ?? []).filter(metric => metric.name === name)
						.flatMap(metric => (metric.sum?.dataPoints ?? metric.histogram?.dataPoints ?? []).map(point => ({
							attributes: attributesFromOtlp(point.attributes),
							value: Number(point.asInt ?? point.asDouble ?? point.count),
						})))));
		});
	}
}

export function defineCopilotRuntimeTelemetryCoverageTests(context: IAgentHostE2ETestContext): void {
	if (context.tier !== 'parity' || context.config.provider !== 'copilotcli') {
		return;
	}
	suite('Copilot runtime telemetry exporter coverage', () => {
		ensureNoDisposablesAreLeakedInTestSuite();
		defineTelemetryTests(context);
	});
}

function defineTelemetryTests(context: IAgentHostE2ETestContext): void {
	let collector: RuntimeOtlpCollector | undefined;
	let suiteStore: DisposableStore | undefined;
	let directory: string | undefined;

	function getCollector(): RuntimeOtlpCollector {
		assert.ok(collector, 'The suite collector must be initialized');
		return collector;
	}

	function nativeSpans(session: ITelemetrySession): readonly ISpan[] {
		const spans = session.spans().filter(span => span.resource['service.name'] === 'github-copilot');
		assert.ok(spans.length > 0, `Expected provider-native spans; collector routes: ${JSON.stringify([...new Set(getCollector().requests.map(request => `${request.method} ${request.path}`))])}`);
		for (const span of spans) {
			assert.deepStrictEqual({ namespace: span.resource['service.namespace'], case: span.resource[caseAttribute], scope: span.scope },
				{ namespace: 'vscode.agent-host', case: session.testCase.id, scope: `runtime.telemetry.${session.testCase.id}` });
			assert.match(span.traceId, /^[a-f0-9]{32}$/i);
			assert.match(span.spanId, /^[a-f0-9]{16}$/i);
		}
		assert.strictEqual(new Set(spans.map(span => span.spanId)).size, spans.length, 'Each finished native span must be exported once');
		return spans;
	}

	function assertToolSpan(session: ITelemetrySession, tool: ChatToolCallCompleteAction, spans: readonly ISpan[]): ISpan {
		const matches = spans.filter(span => operation(span) === 'execute_tool' && span.attributes['gen_ai.tool.call.id'] === tool.toolCallId);
		assert.strictEqual(matches.length, 1, 'The AHP tool call must have one native execute_tool span');
		return matches[0];
	}

	function assertToolCounter(id: string, success: boolean, expected: number): void {
		const values = getCollector().metricPoints(id, 'github.copilot.tool.call.count')
			.filter(point => point.attributes['gen_ai.tool.name'] === 'view' && point.attributes.success === success)
			.map(point => point.value);
		assert.ok(values.length > 0, 'Expected a native tool-call counter exported during shutdown');
		assert.ok(values.every(Number.isFinite));
		// Cumulative exports may repeat the same counter before the final shutdown flush.
		assert.strictEqual(Math.max(...values), expected);
	}

	function assertRootParent(session: ITelemetrySession, spans: readonly ISpan[]): ISpan {
		const root = spans.find(span => operation(span) === 'invoke_agent');
		assert.ok(root, 'Expected a native invoke_agent span');
		const anchors = session.spans().filter(span => span.name === AgentHostSessionSpanName
			&& span.traceId === root.traceId && span.spanId === root.parentSpanId
			&& span.attributes['gen_ai.conversation.id'] === root.attributes['gen_ai.conversation.id']);
		assert.strictEqual(anchors.length, 1, 'Expected exactly one correlated AHP trace anchor at the external destination');
		const anchor = anchors[0];
		assert.deepStrictEqual({ trace: root.traceId, parent: root.parentSpanId }, { trace: anchor.traceId, parent: anchor.spanId });
		return root;
	}

	const cases: ITelemetryCase[] = [{
		id: 'http-private', title: 'HTTP JSON exports native tool spans and shutdown metrics without message content', capture: false, header: true,
		run: async session => {
			const tool = await session.read('telemetry-private-read');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const root = assertRootParent(session, spans);
			const toolSpan = assertToolSpan(session, tool, spans);
			assert.deepStrictEqual({ name: toolSpan.attributes['gen_ai.tool.name'], parent: isDescendant(toolSpan, root, spans), failed: toolSpan.statusCode === 2 },
				{ name: 'view', parent: true, failed: false });
			assert.ok(spans.some(span => operation(span) === 'chat' && isDescendant(span, root, spans)));
			assert.deepStrictEqual(spans.flatMap(span => contentAttributes.filter(attribute => span.attributes[attribute] !== undefined)), []);
			assertToolCounter(session.testCase.id, true, 1);
			assert.ok(getCollector().caseRequests(session.testCase.id, 'metrics').every(request => request.routingHeader === 'synthetic route'));
			assert.ok(getCollector().caseRequests(session.testCase.id, 'traces').some(request => request.routingHeader === 'synthetic route'));
		},
	}, {
		id: 'http-content', title: 'content capture correlates actual tool arguments and results with the following inference', capture: true,
		run: async session => {
			const tool = await session.read('telemetry-captured-read');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const toolSpan = assertToolSpan(session, tool, spans);
			assert.deepStrictEqual({
				arguments: String(toolSpan.attributes['gen_ai.tool.call.arguments']).includes('recovery.txt'),
				result: String(toolSpan.attributes['gen_ai.tool.call.result']).includes(fileContent.trim()),
				followingInference: spans.some(span => operation(span) === 'chat' && String(span.attributes['gen_ai.input.messages']).includes(fileContent.trim())),
			}, { arguments: true, result: true, followingInference: true });
			assertToolCounter(session.testCase.id, true, 1);
		},
	}, {
		id: 'http-failure', title: 'a failed native read records an error span and separate successful recovery metrics', capture: false,
		run: async session => {
			const failed = await session.read('telemetry-missing-read', true);
			const recovered = await session.read('telemetry-recovered-read');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const failedSpan = assertToolSpan(session, failed, spans);
			const recoveredSpan = assertToolSpan(session, recovered, spans);
			assert.deepStrictEqual({
				failure: failedSpan.statusCode,
				exception: failedSpan.events.some(event => event.name === 'gen_ai.client.operation.exception'),
				recoveryFailed: recoveredSpan.statusCode === 2,
			}, { failure: 2, exception: true, recoveryFailed: false });
			assertToolCounter(session.testCase.id, false, 1);
			assertToolCounter(session.testCase.id, true, 1);
		},
	}, {
		id: 'http-turns', title: 'sequential native invocations retain the AHP session parent while exporting distinct spans', capture: false,
		run: async session => {
			await session.turn('telemetry-first-turn', 'Reply exactly TELEMETRY_FIRST. Do not call tools.');
			await session.read('telemetry-second-turn');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const root = assertRootParent(session, spans);
			const roots = spans.filter(span => operation(span) === 'invoke_agent' && span.parentSpanId === root.parentSpanId);
			assert.deepStrictEqual({
				invocations: roots.length,
				conversations: new Set(roots.map(span => span.attributes['gen_ai.conversation.id'])).size,
				traces: new Set(roots.map(span => span.traceId)).size,
				uniqueSpans: new Set(roots.map(span => span.spanId)).size,
			}, { invocations: 2, conversations: 1, traces: 1, uniqueSpans: 2 });
			const calls = getCollector().metricPoints(session.testCase.id, 'gen_ai.invoke_agent.inference_calls');
			assert.ok(calls.some(point => point.value >= 2), 'Shutdown must export metrics for both completed invocations');
		},
	}, {
		id: 'http-model-error', title: 'a terminal provider fault exports native exception metadata before a successful recovery invocation', capture: false,
		run: async session => {
			await session.fail('telemetry-provider-failure');
			const recovery = await session.read('telemetry-provider-recovery');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const failed = spans.find(span => operation(span) === 'invoke_agent' && span.statusCode === 2);
			assert.ok(failed, 'Expected the failed native invocation to be exported');
			assert.ok(failed.events.some(event => event.name === 'gen_ai.client.operation.exception'
				&& event.attributes['github.copilot.error_status_code'] === 500), 'The native exception must retain the actual HTTP status');
			assert.ok(spans.some(span => operation(span) === 'invoke_agent' && span.statusCode !== 2 && span.traceId === failed.traceId));
			assert.strictEqual(assertToolSpan(session, recovery, spans).statusCode === 2, false);
			assertToolCounter(session.testCase.id, true, 1);
		},
	}, {
		id: 'file-spans', title: 'the native file exporter drains finished tool spans when the AHP target shuts down', capture: false, exporter: 'file',
		run: async session => {
			const tool = await session.read('telemetry-file-read');
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const toolSpan = assertToolSpan(session, tool, spans);
			assert.deepStrictEqual({
				tool: toolSpan.attributes['gen_ai.tool.name'],
				failed: toolSpan.statusCode === 2,
				contentFields: contentAttributes.filter(attribute => toolSpan.attributes[attribute] !== undefined),
			}, { tool: 'view', failed: false, contentFields: [] });
			assert.ok(spans.some(span => operation(span) === 'chat'));
			assert.strictEqual(getCollector().caseRequests(session.testCase.id, 'traces').length, 0, 'The file exporter must not also send traces to an HTTP collector');
		},
	}, {
		id: 'http-subagent', title: 'a delegated native read exports the child invocation beneath its spawning tool span', capture: true,
		run: async session => {
			await session.turn('telemetry-child-read',
				`Use task exactly once with agent_type "explore" and model "${model}" to delegate reading "${session.file}". The child must use view exactly once on that file, use no other tools, and return its exact text. Do not read it yourself. After the child finishes, reply exactly CHILD_TELEMETRY_DONE.`);
			const progress = context.client.receivedNotifications(notification =>
				isActionNotification(notification, ActionType.ChatToolCallContentChanged)
				&& getActionEnvelope(notification).channel === buildDefaultChatUri(session.uri))
				.map(notification => getActionEnvelope(notification).action as ChatToolCallContentChangedAction)
				.find(action => action.content.some(content => content.type === ToolResultContentType.Subagent));
			assert.ok(progress, 'Expected an actual AHP subagent reference');
			const task = session.tools.find(tool => tool.toolCallId === progress.toolCallId);
			assert.ok(task, 'Expected the spawning task to complete');
			const childRef = progress.content.find((content): content is ToolResultSubagentContent => content.type === ToolResultContentType.Subagent);
			assert.ok(childRef);
			const child = await retry(async () => {
				const subscription = await context.client.call<SubscribeResult>('subscribe', { channel: childRef.resource });
				const state = subscription.snapshot?.state as ChatState | undefined;
				assert.ok(state && !state.activeTurn && state.turns.length > 0 && state.turns.every(turn => turn.state === TurnState.Complete));
				return state;
			}, 100, 100);
			const childTools = child.turns.flatMap(turn => turn.responseParts)
				.filter(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolName === 'view');
			assert.strictEqual(childTools.length, 1, 'The child must execute one native view tool');
			const childTool = childTools[0];
			assert.ok(childTool.kind === ResponsePartKind.ToolCall && childTool.toolCall.status === ToolCallStatus.Completed);
			assert.deepStrictEqual({
				success: childTool.toolCall.success,
				content: textFromContent(childTool.toolCall.content ?? []).includes(fileContent.trim()),
			}, { success: true, content: true });
			await session.closeAndFlush();
			const spans = nativeSpans(session);
			const taskSpan = assertToolSpan(session, task, spans);
			const childRoot = spans.find(span => operation(span) === 'invoke_agent' && span.parentSpanId === taskSpan.spanId);
			assert.ok(childRoot, 'The child invoke_agent span must be parented by the spawning task');
			const childRead = spans.find(span => operation(span) === 'execute_tool' && span.attributes['gen_ai.tool.name'] === 'view' && isDescendant(span, childRoot, spans));
			assert.ok(childRead, 'Expected the native child file read within its invocation trace');
			assert.deepStrictEqual({
				sameTrace: childRead.traceId === taskSpan.traceId,
				result: String(childRead.attributes['gen_ai.tool.call.result']).includes(fileContent.trim()),
			}, { sameTrace: true, result: true });
			assertToolCounter(session.testCase.id, true, 1);
		},
	}];

	suiteSetup(async function () {
		this.timeout(60_000);
		const parent = join(process.cwd(), '.build', 'agent-host-telemetry-fixtures');
		mkdirSync(parent, { recursive: true });
		directory = mkdtempSync(join(parent, 'suite-'));
		suiteStore = new DisposableStore();
		collector = suiteStore.add(new RuntimeOtlpCollector());
		await collector.start();
		for (const testCase of cases) {
			const caseDirectory = join(directory, testCase.id);
			mkdirSync(caseDirectory);
			context.registerTestEnvironment(`runtime coverage telemetry: ${testCase.title}`, {
				COPILOT_OTEL_ENABLED: 'true',
				COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: 'false',
				COPILOT_OTEL_EXPORTER_TYPE: testCase.exporter ?? 'otlp-http',
				COPILOT_OTEL_FILE_EXPORTER_PATH: testCase.exporter === 'file' ? join(caseDirectory, 'spans.jsonl') : '',
				COPILOT_OTEL_SOURCE_NAME: `runtime.telemetry.${testCase.id}`,
				COPILOT_OTEL_ENDPOINT: '',
				OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: String(testCase.capture),
				OTEL_EXPORTER_OTLP_ENDPOINT: testCase.exporter === 'file' ? '' : `${collector.url}/${testCase.id}/v1/traces`,
				OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
				OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: '',
				OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
				OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: 'http/json',
				OTEL_EXPORTER_OTLP_METRICS_PROTOCOL: 'http/json',
				OTEL_EXPORTER_OTLP_HEADERS: testCase.header ? 'x-runtime-telemetry=synthetic%20route' : '',
				OTEL_EXPORTER_OTLP_TRACES_HEADERS: testCase.header ? 'x-runtime-telemetry=synthetic%20route' : '',
				OTEL_EXPORTER_OTLP_METRICS_HEADERS: testCase.header ? 'x-runtime-telemetry=synthetic%20route' : '',
				OTEL_EXPORTER_OTLP_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_CLIENT_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_CLIENT_KEY: '',
				OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_TRACES_CLIENT_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_TRACES_CLIENT_KEY: '',
				OTEL_EXPORTER_OTLP_METRICS_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_METRICS_CLIENT_CERTIFICATE: '',
				OTEL_EXPORTER_OTLP_METRICS_CLIENT_KEY: '',
				OTEL_TRACES_EXPORTER: 'otlp',
				OTEL_METRICS_EXPORTER: testCase.exporter === 'file' ? 'none' : 'otlp',
				OTEL_SERVICE_NAME: 'vscode-agent-host',
				OTEL_RESOURCE_ATTRIBUTES: `${caseAttribute}=${testCase.id}`,
			});
		}
	});

	suiteTeardown(async function () {
		this.timeout(60_000);
		try {
			suiteStore?.dispose();
			await collector?.whenClosed();
		} finally {
			if (directory) {
				await removeTempDirs([directory]);
			}
		}
	});

	for (const testCase of cases) {
		test(`runtime coverage telemetry: ${testCase.title}`, async function () {
			this.timeout(240_000);
			assert.ok(directory);
			const workspace = join(directory, testCase.id, 'workspace');
			mkdirSync(workspace);
			const file = join(workspace, 'recovery.txt');
			writeFileSync(file, fileContent);
			const store = new DisposableStore();
			try {
				store.add(context.registerFixtureUrl('telemetry', getCollector().url));
				const uri = await createRealSession(context.client, context.config, 'runtime-telemetry-client', context.createdSessions, URI.file(workspace));
				const exportFile = join(directory, testCase.id, 'spans.jsonl');
				let sequence = 10;
				const session: ITelemetrySession = {
					uri, file, exportFile, testCase, tools: [],
					turn: async (id, prompt) => {
						const start = context.observedModelRequestBodies.length;
						await driveTurnWithModelToCompletion(context.client, uri, id, prompt, model, sequence);
						sequence += 100;
						const state = await fetchSessionWithChat(context.client, uri);
						assert.deepStrictEqual({ state: state.turns.find(turn => turn.id === id)?.state, active: state.activeTurn }, { state: TurnState.Complete, active: undefined });
						const requests = context.observedModelRequestBodies.slice(start);
						assert.ok(requests.length > 0, 'Telemetry must come from an actual native model request');
						assert.ok(requests.every(body => summarizeAnthropicRequest(body)?.model === model));
						const completions = context.client.receivedNotifications(notification =>
							isActionNotification(notification, ActionType.ChatToolCallComplete) && getActionEnvelope(notification).channel === buildDefaultChatUri(uri))
							.map(notification => getActionEnvelope(notification).action as ChatToolCallCompleteAction)
							.filter(action => action.turnId === id);
						session.tools.push(...completions);
					},
					fail: async id => {
						const channel = buildDefaultChatUri(uri);
						const start = context.observedModelRequestBodies.length;
						const prompt = 'Reply exactly TELEMETRY_FAILURE_PROBE. Do not call any tools.';
						context.client.clearReceived();
						if (RECORD) {
							context.setRecordingModelResponse({
								status: 500,
								headers: { 'content-type': 'application/json', 'x-should-retry': 'false' },
								body: JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'SYNTHETIC_TELEMETRY_PROVIDER_FAILURE' } }),
							}, '/v1/messages');
						}
						context.client.dispatch({
							channel, clientSeq: sequence,
							action: {
								type: ActionType.ChatTurnStarted, turnId: id, startedAt: new Date().toISOString(),
								message: { text: prompt, origin: { kind: MessageKind.User }, model: { id: model } },
							},
						});
						sequence += 100;
						await context.client.waitForNotification(notification =>
							isActionNotification(notification, ActionType.ChatError)
							&& getActionEnvelope(notification).channel === channel
							&& (getActionEnvelope(notification).action as ChatErrorAction).turnId === id, 90_000);
						const state = await fetchSessionWithChat(context.client, uri);
						const turn = state.turns.find(turn => turn.id === id);
						assert.deepStrictEqual({ state: turn?.state, active: state.activeTurn }, { state: TurnState.Error, active: undefined });
						assert.ok(getErrorResponsePart(turn)?.error.message);
						const requests = context.observedModelRequestBodies.slice(start);
						assert.deepStrictEqual({ requests: requests.length, model: summarizeAnthropicRequest(requests[0] ?? '')?.model, prompt: requests[0]?.includes(prompt) },
							{ requests: 1, model, prompt: true });
					},
					read: async (id, missing = false) => {
						await session.turn(id,
							`Call view exactly once on "${missing ? join(workspace, 'missing.txt') : file}". Do not retry or call other tools. Reply exactly TELEMETRY_READ_DONE.`);
						const starts = context.client.receivedNotifications(notification =>
							isActionNotification(notification, ActionType.ChatToolCallStart) && getActionEnvelope(notification).channel === buildDefaultChatUri(uri))
							.map(notification => getActionEnvelope(notification).action as ChatToolCallStartAction)
							.filter(action => action.turnId === id);
						const results = session.tools.filter(action => action.turnId === id);
						assert.deepStrictEqual({
							names: starts.map(action => action.toolName),
							results: results.map(action => ({ id: action.toolCallId, success: action.result.success, expected: missing ? /does not exist|not found/i.test(textFromContent(action.result.content ?? [])) : textFromContent(action.result.content ?? []).includes(fileContent.trim()) })),
						}, { names: ['view'], results: [{ id: starts[0]?.toolCallId, success: !missing, expected: true }] });
						assert.strictEqual(readFileSync(file, 'utf8'), fileContent);
						return results[0];
					},
					closeAndFlush: async () => {
						await context.client.call('disposeSession', { channel: uri });
						const index = context.createdSessions.indexOf(uri);
						assert.ok(index >= 0);
						context.createdSessions.splice(index, 1);
						await context.restartServer();
					},
					spans: () => {
						if (testCase.exporter !== 'file') {
							return getCollector().spans(testCase.id);
						}
						assert.ok(existsSync(exportFile), 'Expected the native file exporter output after shutdown');
						return readFileSync(exportFile, 'utf8').split(/\r?\n/).filter(Boolean)
							.map(line => JSON.parse(line) as IFileSpan).filter(span => span.type === 'span' && span.resource?.attributes?.['service.name'] === 'github-copilot')
							.map(span => ({
								name: span.name, traceId: span.traceId, spanId: span.spanId, parentSpanId: span.parentSpanId,
								attributes: span.attributes, resource: span.resource.attributes, scope: span.instrumentationScope?.name ?? '',
								statusCode: span.status?.code ?? 0, events: span.events ?? [],
							}));
					},
				};
				await testCase.run(session);
			} finally {
				store.dispose();
			}
		});
	}
}
