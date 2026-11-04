/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ExportResult } from '@opentelemetry/core';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { LogRecordExporter, ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-node';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { CopilotChatAttr, GenAiAttr, GenAiOperationName, StdAttr } from '../../common/genAiAttributes';
import { resolveOTelConfig, type OTelConfigInput } from '../../common/otelConfig';
import { agentIdentityAttributes, filterIdentityAttributes, identityResourceAttributes } from '../../common/otelIdentity';
import type { ICompletedSpanData } from '../../common/otelService';
import { InMemoryOTelService } from '../inMemoryOTelService';
import { IdentitySpanExporter } from '../otelIdentityExporters';
import { NodeOTelService, type OTelLogFn } from '../otelServiceImpl';

class TestAuthentication {
	anyGitHubSession: AuthenticationSession | undefined;
	signIn(name: string): void {
		this.anyGitHubSession = { id: name, accessToken: 'test-token', account: { id: name, label: name }, scopes: [] };
	}
}

class RecordingSpanExporter implements SpanExporter {
	readonly spans: ReadableSpan[] = [];
	export(spans: ReadableSpan[], callback: (result: ExportResult) => void): void {
		this.spans.push(...spans);
		callback({ code: 0 });
	}
	async shutdown(): Promise<void> { }
}

class RecordingLogExporter implements LogRecordExporter {
	readonly logs: ReadableLogRecord[] = [];
	export(logs: ReadableLogRecord[], callback: (result: ExportResult) => void): void {
		this.logs.push(...logs);
		callback({ code: 0 });
	}
	async shutdown(): Promise<void> { }
}

class RecordingMetricExporter implements PushMetricExporter {
	readonly metrics: ResourceMetrics[] = [];
	export(metrics: ResourceMetrics, callback: (result: ExportResult) => void): void {
		this.metrics.push(metrics);
		callback({ code: 0 });
	}
	async forceFlush(): Promise<void> { }
	async shutdown(): Promise<void> { }
}

function config(input: Partial<OTelConfigInput> = {}) {
	return resolveOTelConfig({ env: {}, extensionVersion: 'test', sessionId: 'test', settingEnabled: true, ...input });
}

describe('governed OTel identity', () => {
	let service: NodeOTelService | undefined;
	afterEach(async () => { await service?.shutdown(); });

	async function start(input: Partial<OTelConfigInput> = {}, allowed = () => true, getOSUsername?: () => string, logFn?: OTelLogFn) {
		const exporters = {
			spanExporter: new RecordingSpanExporter(),
			logExporter: new RecordingLogExporter(),
			metricExporter: new RecordingMetricExporter(),
		};
		service = new NodeOTelService(config(input), logFn, undefined, allowed, async () => exporters, getOSUsername);
		const current = service;
		// Buffered completion proves SDK initialization finished without inspecting private state.
		await new Promise<void>(resolve => {
			const listener = current.onDidCompleteSpan(span => {
				if (span.name === 'ready') {
					listener.dispose();
					resolve();
				}
			});
			current.startSpan('ready').end();
		});
		await current.flush();
		exporters.spanExporter.spans.length = 0;
		return { service: current, ...exporters };
	}

	it('does not detect or export identity by default, even from explicit resource attributes', async () => {
		let detected = false;
		expect(identityResourceAttributes({ 'host.name': 'explicit', team: 'test' }, false, () => {
			detected = true;
			return { username: 'os-user', hostname: 'os-host' };
		})).toEqual({ team: 'test' });
		expect(detected).toBe(false);
		const { service, spanExporter } = await start({ settingResourceAttributes: { 'host.name': 'explicit', 'process.user.name': 'explicit' } });
		service.startSpan('invoke_agent', { attributes: { [StdAttr.USER_NAME]: 'sdk-opt-in', 'enduser.pseudo.id': 'unchanged' } }).end();
		await service.flush();
		expect(spanExporter.spans[0].attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		expect(spanExporter.spans[0].resource.attributes).not.toHaveProperty(StdAttr.HOST_NAME);
		expect(spanExporter.spans[0].resource.attributes).not.toHaveProperty(StdAttr.PROCESS_USER_NAME);
	});

	it('attributes top-level and subagent invocations to the current account without enabling content', async () => {
		const auth = new TestAuthentication();
		auth.signIn('first-account');
		const { service, spanExporter } = await start({ settingCaptureIdentity: true, settingCaptureContent: false });
		await service.startActiveSpan('invoke_agent parent', {
			attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT, ...agentIdentityAttributes(service.config, auth), [GenAiAttr.INPUT_MESSAGES]: 'private prompt' },
		}, async span => {
			span.addEvent('user_message', { content: 'private prompt' });
			service.startSpan('invoke_agent subagent', {
				attributes: { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT, ...agentIdentityAttributes(service.config, auth) },
			}).end();
		});
		auth.signIn('second-account');
		service.startSpan('invoke_agent switched', { attributes: agentIdentityAttributes(service.config, auth) }).end();
		auth.anyGitHubSession = undefined;
		service.startSpan('invoke_agent signed-out', { attributes: agentIdentityAttributes(service.config, auth) }).end();
		await service.flush();
		expect(spanExporter.spans.map(span => [span.name, span.attributes[StdAttr.USER_NAME]])).toEqual([
			['invoke_agent subagent', 'first-account'], ['invoke_agent parent', 'first-account'],
			['invoke_agent switched', 'second-account'], ['invoke_agent signed-out', undefined],
		]);
		expect(spanExporter.spans[1].attributes).not.toHaveProperty(GenAiAttr.INPUT_MESSAGES);
		expect(spanExporter.spans[1].events[0].attributes).toEqual({});
		expect(spanExporter.spans[0].resource.attributes).toMatchObject({
			[StdAttr.PROCESS_USER_NAME]: expect.any(String), [StdAttr.HOST_NAME]: expect.any(String),
		});
	});

	it('uses managed, then environment, then detected resource identity', () => {
		const resolved = config({
			settingCaptureIdentity: true,
			env: { OTEL_RESOURCE_ATTRIBUTES: 'host.name=environment-host,process.user.name=environment-user' },
			policyResourceAttributes: { 'host.name': 'managed-host' },
		});
		expect(identityResourceAttributes(resolved.resourceAttributes, resolved.captureIdentity, () => ({
			username: 'detected-user', hostname: 'detected-host',
		}))).toEqual({ 'host.name': 'managed-host', 'process.user.name': 'environment-user' });
	});

	for (const captureIdentity of [false, true]) {
		it(`preserves shared resources across span and log batches with identity ${captureIdentity}`, async () => {
			let allowed = true;
			const { service, spanExporter, logExporter } = await start({ settingCaptureIdentity: captureIdentity }, () => allowed);
			for (let batch = 0; batch < 2; batch++) {
				for (let index = 0; index < 3; index++) {
					service.startSpan('batched').end();
					service.emitLogRecord('batched');
				}
				await service.flush();
			}
			const originalResource = spanExporter.spans[0].resource;
			expect({
				spans: spanExporter.spans.length,
				logs: logExporter.logs.length,
				spanResources: new Set(spanExporter.spans.map(span => span.resource)).size,
				logResources: new Set(logExporter.logs.map(log => log.resource)).size,
			}).toEqual({ spans: 6, logs: 6, spanResources: 1, logResources: 1 });

			allowed = false;
			service.startSpan('denied').end();
			service.emitLogRecord('denied');
			await service.flush();
			const deniedResource = spanExporter.spans.at(-1)!.resource;
			expect({
				sameResource: deniedResource === originalResource,
				originalHasIdentity: StdAttr.PROCESS_USER_NAME in originalResource.attributes,
				deniedHasIdentity: StdAttr.PROCESS_USER_NAME in deniedResource.attributes,
				deniedLogHasIdentity: StdAttr.PROCESS_USER_NAME in logExporter.logs.at(-1)!.resource.attributes,
			}).toEqual({
				sameResource: !captureIdentity,
				originalHasIdentity: captureIdentity,
				deniedHasIdentity: false,
				deniedLogHasIdentity: false,
			});
		});
	}

	for (const explicitUsername of [undefined, 'managed-user']) {
		it(`continues exporting when OS username detection fails${explicitUsername ? ' with an explicit username' : ''}`, async () => {
			const warnings: string[] = [];
			const { service, spanExporter, logExporter, metricExporter } = await start({
				settingCaptureIdentity: true,
				policyResourceAttributes: explicitUsername ? { [StdAttr.PROCESS_USER_NAME]: explicitUsername } : undefined,
			}, () => true, () => {
				throw new Error('No passwd entry');
			}, (level, message) => warnings.push(`${level}: ${message}`));
			service.startSpan('identity-unavailable').end();
			service.emitLogRecord('identity-unavailable');
			service.incrementCounter('test.identityUnavailable');
			await service.flush();
			const resource = spanExporter.spans[0].resource;
			expect({
				spans: spanExporter.spans.length,
				logs: logExporter.logs.length,
				hasMetric: metricExporter.metrics.some(batch => batch.scopeMetrics.some(scope =>
					scope.metrics.some(metric => metric.descriptor.name === 'test.identityUnavailable'))),
				usernamePresent: StdAttr.PROCESS_USER_NAME in resource.attributes,
				username: resource.attributes[StdAttr.PROCESS_USER_NAME],
				hostname: resource.attributes[StdAttr.HOST_NAME],
				warnings: warnings.filter(message => message.startsWith('warn:')),
			}).toEqual({
				spans: 1, logs: 1, hasMetric: true,
				usernamePresent: explicitUsername !== undefined,
				username: explicitUsername,
				hostname: expect.any(String),
				warnings: ['warn: [OTel] Could not detect the OS username; continuing without a detected process.user.name.'],
			});
		});
	}

	it('does not query the OS username when identity is disabled', async () => {
		let calls = 0;
		await start({}, () => true, () => {
			calls++;
			throw new Error('Must not query OS identity without consent');
		});
		expect(calls).toBe(0);
	});

	it('managed false defeats local, environment, and SDK-supplied identity', async () => {
		const { service, spanExporter } = await start({
			settingCaptureIdentity: true, policyCaptureIdentity: false,
			env: { COPILOT_OTEL_CAPTURE_IDENTITY: 'true', OTEL_RESOURCE_ATTRIBUTES: 'host.name=environment-host' },
			settingResourceAttributes: { 'user.name': 'personal-account' },
			policyResourceAttributes: { 'process.user.name': 'managed-user', team: 'managed-team' },
		});
		service.startSpan('invoke_agent', { attributes: { [StdAttr.USER_NAME]: 'sdk-identity' } }).end();
		await service.flush();
		expect(spanExporter.spans[0].attributes).toEqual({});
		expect(spanExporter.spans[0].resource.attributes).toMatchObject({ team: 'managed-team' });
		for (const key of [StdAttr.USER_NAME, StdAttr.HOST_NAME, StdAttr.PROCESS_USER_NAME]) {
			expect(spanExporter.spans[0].resource.attributes).not.toHaveProperty(key);
		}
	});

	for (const exporterType of ['otlp-http', 'otlp-grpc', 'file', 'console'] as const) {
		for (const captureContent of [false, true]) {
			it(`${exporterType} primary export gates known span/event content (${captureContent}) independently of local debug retention`, async () => {
				const { service, spanExporter } = await start({ settingExporterType: exporterType, settingCaptureContent: captureContent });
				const content = Object.fromEntries([
					GenAiAttr.INPUT_MESSAGES, GenAiAttr.OUTPUT_MESSAGES, GenAiAttr.SYSTEM_INSTRUCTIONS,
					GenAiAttr.TOOL_DEFINITIONS, GenAiAttr.TOOL_DESCRIPTION, GenAiAttr.TOOL_CALL_ARGUMENTS, GenAiAttr.TOOL_CALL_RESULT,
					CopilotChatAttr.USER_REQUEST, CopilotChatAttr.REASONING_CONTENT, CopilotChatAttr.PROMPT_CONTEXT,
					CopilotChatAttr.PROMPT_INSTRUCTIONS, CopilotChatAttr.MARKDOWN_CONTENT,
					CopilotChatAttr.HOOK_INPUT, CopilotChatAttr.HOOK_OUTPUT, 'content', 'toolDefinitions',
				].map(key => [key, 'private content']));
				const metadata = { [GenAiAttr.OPERATION_NAME]: GenAiOperationName.INVOKE_AGENT, 'custom.attribute': 'not universally sanitized' };
				const completions: ICompletedSpanData[] = [];
				const listener = service.onDidCompleteSpan(span => completions.push(span));
				const span = service.startSpan('invoke_agent', { attributes: { ...content, ...metadata } });
				span.addEvent('content-event', { ...content, ...metadata });
				span.end();
				await service.flush();
				listener.dispose();
				const expected = captureContent ? { ...content, ...metadata } : metadata;
				expect({
					exported: spanExporter.spans[0].attributes,
					eventName: spanExporter.spans[0].events[0].name,
					event: spanExporter.spans[0].events[0].attributes,
					local: completions[0].attributes,
					localEvent: completions[0].events[0].attributes,
				}).toEqual({
					exported: expected,
					eventName: 'content-event',
					event: expected,
					local: { ...content, ...metadata },
					localEvent: { ...content, ...metadata },
				});
			});
		}
	}

	it('revokes identity on queued spans, in-flight completions, logs, metrics, and resources before reload', async () => {
		let allowed = true;
		const { service, spanExporter, logExporter, metricExporter } = await start({ settingCaptureIdentity: true }, () => allowed);
		const completions: ICompletedSpanData[] = [];
		const listener = service.onDidCompleteSpan(span => completions.push(span));
		const attributes = { [StdAttr.USER_NAME]: 'private-account', [StdAttr.HOST_NAME]: 'private-host', 'enduser.pseudo.id': 'unchanged' };
		const inFlight = service.startSpan('in-flight', { attributes });
		service.startSpan('queued', { attributes }).end();
		service.emitLogRecord('event', attributes);
		service.incrementCounter('test.identity', 1, attributes);
		allowed = false;
		inFlight.end();
		await service.flush();
		listener.dispose();
		expect(completions.at(-1)?.attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		expect(spanExporter.spans.map(span => span.attributes)).toEqual([
			{ 'enduser.pseudo.id': 'unchanged' }, { 'enduser.pseudo.id': 'unchanged' },
		]);
		expect(logExporter.logs[0].attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		const metric = metricExporter.metrics.flatMap(batch => batch.scopeMetrics.flatMap(scope => scope.metrics)).find(metric => metric.descriptor.name === 'test.identity');
		expect(metric?.dataPoints[0].attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		for (const resource of [...spanExporter.spans, ...logExporter.logs, ...metricExporter.metrics].map(record => record.resource)) {
			expect(resource.attributes).not.toHaveProperty(StdAttr.HOST_NAME);
			expect(resource.attributes).not.toHaveProperty(StdAttr.PROCESS_USER_NAME);
		}
	});

	for (const restoredPolicy of [true, undefined]) {
		it(`keeps identity denied until reconstruction after policy ${restoredPolicy === undefined ? 'withdrawal' : 're-enablement'}`, async () => {
			const input: Partial<OTelConfigInput> = {
				settingCaptureIdentity: true,
				env: { COPILOT_OTEL_CAPTURE_IDENTITY: 'true' },
				policyCaptureIdentity: true,
			};
			const allowed = () => config(input).captureIdentity;
			const { service, spanExporter, logExporter, metricExporter } = await start(input, allowed);
			input.policyCaptureIdentity = false;
			service.startSpan('denied').end();
			await service.flush();
			spanExporter.spans.length = 0;

			input.policyCaptureIdentity = restoredPolicy;
			const attributes = { [StdAttr.USER_NAME]: 'account', 'enduser.pseudo.id': 'unchanged' };
			const completions: ICompletedSpanData[] = [];
			const listener = service.onDidCompleteSpan(span => completions.push(span));
			service.startSpan('still-denied', { attributes }).end();
			service.emitLogRecord('still-denied', attributes);
			service.incrementCounter('test.restored', 1, attributes);
			await service.flush();
			listener.dispose();
			const metric = metricExporter.metrics.flatMap(batch => batch.scopeMetrics.flatMap(scope => scope.metrics))
				.find(metric => metric.descriptor.name === 'test.restored');
			expect({
				span: spanExporter.spans[0].attributes,
				completion: completions[0].attributes,
				log: logExporter.logs[0].attributes,
				metric: metric?.dataPoints[0].attributes,
				resource: filterIdentityAttributes(spanExporter.spans[0].resource.attributes, false),
			}).toEqual({
				span: { 'enduser.pseudo.id': 'unchanged' },
				completion: { 'enduser.pseudo.id': 'unchanged' },
				log: { 'enduser.pseudo.id': 'unchanged' },
				metric: { 'enduser.pseudo.id': 'unchanged' },
				resource: spanExporter.spans[0].resource.attributes,
			});

			await service.shutdown();
			const restarted = await start(input, allowed);
			restarted.service.startSpan('restored', { attributes }).end();
			await restarted.service.flush();
			expect(restarted.spanExporter.spans[0].attributes).toEqual(attributes);
		});
	}

	it('filters the local SQLite boundary without removing debug content or mutating source spans', async () => {
		const { service, spanExporter } = await start({ settingCaptureIdentity: true, settingCaptureContent: true });
		service.startSpan('invoke_agent', { attributes: { [StdAttr.USER_NAME]: 'account', [GenAiAttr.INPUT_MESSAGES]: 'debug content' } }).end();
		await service.flush();
		const sqlite = new RecordingSpanExporter();
		const exporter = new IdentitySpanExporter(sqlite, () => false, resource => resourceFromAttributes(filterIdentityAttributes(resource.attributes, false)));
		exporter.export(spanExporter.spans, () => { });
		expect(sqlite.spans[0].attributes).toEqual({ [GenAiAttr.INPUT_MESSAGES]: 'debug content' });
		expect(spanExporter.spans[0].attributes[StdAttr.USER_NAME]).toBe('account');
	});

	it('filters SDK-injected identity from the disabled in-memory/debug pipeline', async () => {
		const memory = new InMemoryOTelService(config({ settingEnabled: false }));
		const spans: ICompletedSpanData[] = [];
		const listener = memory.onDidCompleteSpan(span => spans.push(span));
		memory.startSpan('sdk span', { attributes: { [StdAttr.USER_NAME]: 'sdk-opt-in', 'enduser.pseudo.id': 'unchanged' } }).end();
		expect(spans[0].attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		memory.injectCompletedSpan({ ...spans[0], attributes: { [StdAttr.USER_NAME]: 'sdk-injected', 'enduser.pseudo.id': 'unchanged' } });
		expect(spans[1].attributes).toEqual({ 'enduser.pseudo.id': 'unchanged' });
		listener.dispose();
		await memory.shutdown();
	});
});
