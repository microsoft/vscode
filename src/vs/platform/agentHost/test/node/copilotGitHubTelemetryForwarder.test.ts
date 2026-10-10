/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubTelemetryNotification } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { CopilotGitHubTelemetryForwarder } from '../../node/copilot/copilotGitHubTelemetryForwarder.js';

interface CapturedEvent {
	eventName: string;
	data: ITelemetryData | undefined;
}

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;

	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'sessionId';
	readonly machineId = 'machineId';
	readonly sqmId = 'sqmId';
	readonly devDeviceId = 'devDeviceId';
	readonly firstSessionDate = 'firstSessionDate';
	readonly events: CapturedEvent[] = [];

	publicLog(eventName: string, data?: ITelemetryData): void {
		this.events.push({ eventName, data });
	}
	publicLogError(): void { }
	publicLog2(eventName: string, data?: ITelemetryData): void {
		this.publicLog(eventName, data);
	}
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

suite('CopilotGitHubTelemetryForwarder', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards a standard event to VS Code telemetry', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);

		forwarder.forward({
			sessionId: 'notification-session',
			restricted: false,
			event: {
				kind: 'tool_call_executed',
				created_at: '2026-07-10T12:00:00Z',
				model_call_id: 'model-call',
				properties: { tool_name: 'grep', secondary_assignment_context: 'secondary:1' },
				metrics: { duration_ms: 42 },
				exp_assignment_context: 'experiment',
				features: { featureA: 'enabled' },
				copilot_tracking_id: 'tracking-id',
				client: {
					cli_version: '1.0.69',
					os_platform: 'win32',
					os_version: '11',
					os_arch: 'x64',
					node_version: '24.0.0',
					is_staff: true,
				},
			},
		});

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'copilotSdk/tool_call_executed',
			data: {
				cli_version: '1.0.69',
				os_platform: 'win32',
				os_version: '11',
				os_arch: 'x64',
				node_version: '24.0.0',
				is_staff: true,
				tool_name: 'grep',
				duration_ms: 42,
				created_at: '2026-07-10T12:00:00Z',
				model_call_id: 'model-call',
				exp_assignment_context: 'experiment',
				session_id: 'notification-session',
				sdk_session_id: 'notification-session',
				copilot_tracking_id: 'tracking-id',
				kind: 'tool_call_executed',
				restricted: false,
				'feature.featureA': 'enabled',
			},
		}]);
	});

	test('enriches SDK events with discovery identity without replacing the optional runtime identity', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		for (const kind of ['response.success', 'response.error', 'tool_call_executed']) {
			for (const runtimeId of [undefined, 'runtime-id']) {
				forwarder.forward({
					sessionId: 'sdk-session', restricted: false,
					event: { kind, properties: {}, metrics: {}, copilot_tracking_id: runtimeId },
				}, 'turn-1', undefined, { copilotSku: 'sku-a', copilotTrackingId: 'analytics-a' });
			}
		}
		assert.deepStrictEqual(telemetryService.events.map(({ eventName, data }) => ({
			eventName, copilotSku: data?.copilotSku, trackingId: data?.['common.copilotTrackingId'], runtimeId: data?.copilot_tracking_id,
		})), ['response.success', 'response.error', 'tool_call_executed'].flatMap(kind => [undefined, 'runtime-id'].map(runtimeId => ({
			eventName: `copilotSdk/${kind}`, copilotSku: 'sku-a', trackingId: 'analytics-a', runtimeId,
		}))));
	});

	test('reuses standard runtime canvas tool and authoring events without requiring restricted telemetry', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		for (const toolName of ['list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action', 'extensions_reload']) {
			forwarder.forward({
				sessionId: 'sdk-session', restricted: false,
				event: { kind: 'tool_call_executed', properties: { tool_name: toolName, invoke_outcome: 'success' }, metrics: { duration_ms: 42 } },
			});
		}
		const skillNameHash = '33b7d9f0b8715b9f10e8185fb3fd5405e7ca6ac4e5e005885982b019378097f1';
		forwarder.forward({
			sessionId: 'sdk-session', restricted: false,
			event: { kind: 'skill_invoked', properties: { skill_name_hash: skillNameHash }, metrics: { skill_content_length: 200, allowed_tools_count: 0 } },
		});
		forwarder.forward({
			sessionId: 'sdk-session', restricted: true,
			event: { kind: 'skill_invoked', properties: { skill_name: 'create-canvas', skill_path: '/private/skill.md' }, metrics: {} },
		});
		assert.deepStrictEqual(telemetryService.events.map(({ eventName, data }) => ({
			eventName, restricted: data?.restricted, toolName: data?.tool_name, durationMs: data?.duration_ms,
			skillNameHash: data?.skill_name_hash, skillContentLength: data?.skill_content_length, allowedToolsCount: data?.allowed_tools_count,
		})), [
			...['list_canvas_capabilities', 'open_canvas', 'invoke_canvas_action', 'extensions_reload'].map(toolName => ({
				eventName: 'copilotSdk/tool_call_executed', restricted: false, toolName, durationMs: 42,
				skillNameHash: undefined, skillContentLength: undefined, allowedToolsCount: undefined,
			})),
			{
				eventName: 'copilotSdk/skill_invoked', restricted: false, toolName: undefined, durationMs: undefined,
				skillNameHash, skillContentLength: 200, allowedToolsCount: 0,
			},
		]);
	});

	test('forwards HydraFusion route, failure, phase, and turn events', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		const notification = (kind: string, properties: Record<string, string>, metrics: Record<string, number> = {}): GitHubTelemetryNotification => ({
			sessionId: 'fusion-session',
			restricted: false,
			event: { kind, properties, metrics },
		});
		forwarder.forward(notification('hydrafusion_route', {
			fusion_id: 'fusion-1',
			synthetic_model: 'hydrafusion',
			pattern: 'critique',
			primary_model: 'gpt-5.6-sol',
		}, {
			routing_latency_ms: 12,
			reasoning_score: 0.75,
		}));
		forwarder.forward(notification('hydrafusion_route_failed', {
			synthetic_model: 'hydrafusion',
			reason: 'route_unavailable',
			fallback_model: 'claude-opus-5',
		}));
		forwarder.forward(notification('hydrafusion_phase', {
			fusion_id: 'fusion-1',
			phase_id: 'phase-1',
			phase_kind: 'primary',
			status: 'succeeded',
			model: 'gpt-5.6-sol',
		}, {
			duration_ms: 100,
			request_count: 1,
			total_nano_aiu: 2_000_000_000,
		}));
		forwarder.forward(notification('hydrafusion_turn', {
			fusion_id: 'fusion-1',
			synthetic_model: 'hydrafusion',
			pattern: 'critique',
			outcome: 'succeeded',
			final_source_model: 'gpt-5.6-sol',
		}, {
			duration_ms: 120,
			phase_count: 1,
			total_nano_aiu: 2_000_000_000,
		}));

		assert.deepStrictEqual(telemetryService.events.map(({ eventName, data }) => ({
			eventName,
			sessionId: data?.sdk_session_id,
			fusionId: data?.fusion_id,
			syntheticModel: data?.synthetic_model,
			durationMs: data?.duration_ms,
			totalNanoAiu: data?.total_nano_aiu,
		})), [
			{
				eventName: 'copilotSdk/hydrafusion_route',
				sessionId: 'fusion-session',
				fusionId: 'fusion-1',
				syntheticModel: 'hydrafusion',
				durationMs: undefined,
				totalNanoAiu: undefined,
			},
			{
				eventName: 'copilotSdk/hydrafusion_route_failed',
				sessionId: 'fusion-session',
				fusionId: undefined,
				syntheticModel: 'hydrafusion',
				durationMs: undefined,
				totalNanoAiu: undefined,
			},
			{
				eventName: 'copilotSdk/hydrafusion_phase',
				sessionId: 'fusion-session',
				fusionId: 'fusion-1',
				syntheticModel: undefined,
				durationMs: 100,
				totalNanoAiu: 2_000_000_000,
			},
			{
				eventName: 'copilotSdk/hydrafusion_turn',
				sessionId: 'fusion-session',
				fusionId: 'fusion-1',
				syntheticModel: 'hydrafusion',
				durationMs: 120,
				totalNanoAiu: 2_000_000_000,
			},
		]);
	});

	test('gates restricted events on the restricted telemetry option', () => {
		const telemetryService = new TestTelemetryService();
		let restrictedTelemetryEnabled = false;
		const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, telemetryService);
		const notification: GitHubTelemetryNotification = {
			sessionId: 'session',
			restricted: true,
			event: {
				kind: 'restricted_event',
				properties: {},
				metrics: {},
			},
		};

		forwarder.forward(notification);
		restrictedTelemetryEnabled = true;
		forwarder.forward(notification);

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'copilotSdk/restricted_event',
			data: {
				created_at: undefined,
				model_call_id: undefined,
				exp_assignment_context: undefined,
				session_id: 'session',
				sdk_session_id: 'session',
				copilot_tracking_id: undefined,
				kind: 'restricted_event',
				restricted: true,
			},
		}]);
	});

	test('adds Agent Host turn correlation only to response events', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		const notification = (kind: string, properties: Record<string, string> = {}, metrics: Record<string, number> = {}): GitHubTelemetryNotification => ({
			sessionId: 'session',
			restricted: false,
			event: {
				kind,
				properties,
				metrics,
			},
		});

		forwarder.forward(notification('response.success', { turnId: 'runtime-turn' }), 'turn-1');
		forwarder.forward(notification('response.error', {}, { turnId: 42 }));
		forwarder.forward(notification('tool_call_executed', { turnId: 'runtime-turn' }), 'turn-1');
		forwarder.forward(notification('response.success', { turnId: 'runtime-turn' }));

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			eventName: event.eventName,
			turnId: event.data?.turnId,
		})), [
			{ eventName: 'copilotSdk/response.success', turnId: 'turn-1' },
			{ eventName: 'copilotSdk/response.error', turnId: undefined },
			{ eventName: 'copilotSdk/tool_call_executed', turnId: 'runtime-turn' },
			{ eventName: 'copilotSdk/response.success', turnId: undefined },
		]);
	});

	test('forwards tool_call_executed outcome and token-count columns', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);

		forwarder.forward({
			sessionId: 'session',
			restricted: false,
			event: {
				kind: 'tool_call_executed',
				properties: {
					tool_name: 'grep',
					result_type: 'SUCCESS',
					invoke_outcome: 'success',
					search_engine: 'tgrep',
					model: 'gpt-5.5',
					tool_call_id: 'call-1',
				},
				metrics: {
					duration_ms: 12,
					result_token_count: 34,
				},
			},
		});

		const event = telemetryService.events[0];
		assert.strictEqual(event.eventName, 'copilotSdk/tool_call_executed');
		assert.strictEqual(event.data?.invoke_outcome, 'success');
		assert.strictEqual(event.data?.result_type, 'SUCCESS');
		assert.strictEqual(event.data?.result_token_count, 34);
		assert.strictEqual(event.data?.duration_ms, 12);
		assert.strictEqual(event.data?.tool_call_id, 'call-1');
		assert.strictEqual(event.data?.search_engine, 'tgrep');
	});

	test('forwards indexed search telemetry and gates restricted errors', () => {
		const telemetryService = new TestTelemetryService();
		let restrictedTelemetryEnabled = false;
		const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, telemetryService);

		forwarder.forward({
			sessionId: 'session',
			restricted: false,
			event: {
				kind: 'tgrep_startup',
				properties: { outcome: 'started', forced_by_env: 'false', warm_start: 'true', eligible: 'true' },
				metrics: { file_count: 50_000, startup_duration_ms: 120 },
			},
		});
		forwarder.forward({
			sessionId: 'session',
			restricted: false,
			event: {
				kind: 'tgrep_incremental_indexing',
				properties: { phase: 'updated' },
				metrics: { changed_file_count: 2, total_change_count: 2, total_duration_ms: 15 },
			},
		});
		const serverError: GitHubTelemetryNotification = {
			sessionId: 'session',
			restricted: true,
			event: {
				kind: 'tgrep_server_error',
				properties: { error_type: 'unexpected_exit', error_message: '/private/repository failed' },
				metrics: { exit_code: 1 },
			},
		};
		forwarder.forward(serverError);
		restrictedTelemetryEnabled = true;
		forwarder.forward(serverError);

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			eventName: event.eventName,
			data: event.data,
		})), [
			{
				eventName: 'copilotSdk/tgrep_startup',
				data: {
					outcome: 'started',
					forced_by_env: 'false',
					warm_start: 'true',
					eligible: 'true',
					file_count: 50_000,
					startup_duration_ms: 120,
					created_at: undefined,
					model_call_id: undefined,
					exp_assignment_context: undefined,
					session_id: 'session',
					sdk_session_id: 'session',
					copilot_tracking_id: undefined,
					kind: 'tgrep_startup',
					restricted: false,
				},
			},
			{
				eventName: 'copilotSdk/tgrep_incremental_indexing',
				data: {
					phase: 'updated',
					changed_file_count: 2,
					total_change_count: 2,
					total_duration_ms: 15,
					created_at: undefined,
					model_call_id: undefined,
					exp_assignment_context: undefined,
					session_id: 'session',
					sdk_session_id: 'session',
					copilot_tracking_id: undefined,
					kind: 'tgrep_incremental_indexing',
					restricted: false,
				},
			},
			{
				eventName: 'copilotSdk/tgrep_server_error',
				data: {
					error_type: 'unexpected_exit',
					error_message: '/private/repository failed',
					exit_code: 1,
					created_at: undefined,
					model_call_id: undefined,
					exp_assignment_context: undefined,
					session_id: 'session',
					sdk_session_id: 'session',
					copilot_tracking_id: undefined,
					kind: 'tgrep_server_error',
					restricted: true,
				},
			},
		]);
	});

	test('only accepts host correlation diagnostics on response events', () => {
		const telemetryService = new TestTelemetryService();
		let restrictedTelemetryEnabled = false;
		const forwarder = new CopilotGitHubTelemetryForwarder(() => restrictedTelemetryEnabled, telemetryService);
		const client = {
			cli_version: '1.0.69', os_platform: 'win32', os_version: '11', os_arch: 'x64', node_version: '24.0.0',
			ahActiveRootTurnIdAtResponse: 'sdk-root', ahSessionDisposedDuringWait: true,
		};
		const notification = (kind: string, restricted = false): GitHubTelemetryNotification => ({
			sessionId: 'session',
			restricted,
			event: {
				kind,
				client,
				properties: { ahCorrelationOutcome: 'sdk-value', turnId: 'sdk-turn' },
				metrics: { ahCorrelationWaitMs: 999, ahSessionDisposedDuringWait: 1 },
			},
		});
		const correlation = {
			ahCorrelationOutcome: 'waitExpired' as const,
			ahCorrelationWaitMs: 101,
			ahActiveRootTurnIdAtResponse: 'host-root',
			ahSessionDisposedDuringWait: true,
		};
		forwarder.forward(notification('response.success'), undefined, correlation);
		forwarder.forward(notification('response.error'), undefined, correlation);
		forwarder.forward(notification('tool_call_executed'), undefined, correlation);
		forwarder.forward(notification('response.success'));
		forwarder.forward(notification('response.error'));
		forwarder.forward(notification('response.success', true), undefined, correlation);
		forwarder.forward(notification('response.error', true), undefined, correlation);
		restrictedTelemetryEnabled = true;
		forwarder.forward(notification('response.error', true), undefined, correlation);

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			eventName: event.eventName,
			diagnostics: Object.fromEntries(Object.entries(event.data ?? {}).filter(([key]) => key.startsWith('ah'))),
			turn: event.data?.turnId,
		})), [
			{ eventName: 'copilotSdk/response.success', diagnostics: correlation, turn: undefined },
			{ eventName: 'copilotSdk/response.error', diagnostics: correlation, turn: undefined },
			{ eventName: 'copilotSdk/tool_call_executed', diagnostics: {}, turn: 'sdk-turn' },
			{ eventName: 'copilotSdk/response.success', diagnostics: {}, turn: undefined },
			{ eventName: 'copilotSdk/response.error', diagnostics: {}, turn: undefined },
			{ eventName: 'copilotSdk/response.error', diagnostics: correlation, turn: undefined },
		]);
	});

	test('omits contextual diagnostics for correlated responses and disposal when no wait occurred', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		for (const kind of ['response.success', 'response.error']) {
			const notification: GitHubTelemetryNotification = {
				sessionId: 'session', restricted: false,
				event: { kind, properties: {}, metrics: {} },
			};
			const contextual = { ahActiveRootTurnIdAtResponse: 'root-candidate', ahSessionDisposedDuringWait: true };
			forwarder.forward(notification, 'host-turn', { ...contextual, ahCorrelationOutcome: 'mappingAvailable' });
			forwarder.forward(notification, 'host-turn', { ...contextual, ahCorrelationOutcome: 'mappingWaited', ahCorrelationWaitMs: 0 });
			forwarder.forward(notification, undefined, { ...contextual, ahCorrelationOutcome: 'responseAlreadyForwarded' });
		}

		assert.deepStrictEqual(telemetryService.events.map(event => ({
			turn: event.data?.turnId,
			diagnostics: Object.fromEntries(Object.entries(event.data ?? {}).filter(([key]) => key.startsWith('ah'))),
		})), ['response.success', 'response.error'].flatMap(() => [
			{ turn: 'host-turn', diagnostics: { ahCorrelationOutcome: 'mappingAvailable' } },
			{ turn: 'host-turn', diagnostics: { ahCorrelationOutcome: 'mappingWaited', ahCorrelationWaitMs: 0 } },
			{ turn: undefined, diagnostics: { ahCorrelationOutcome: 'responseAlreadyForwarded', ahActiveRootTurnIdAtResponse: 'root-candidate' } },
		]));
	});

	test('records host ownership independently of SDK response forwarding', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		forwarder.recordModelCallTurnCorrelation('sdk-session', 'call', 'host-turn', 'late');
		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.modelCallTurnCorrelated',
			data: { sdkSessionId: 'sdk-session', modelCallId: 'call', turnId: 'host-turn', mappingStatus: 'late' },
		}]);
	});

	test('reports usage availability on successes and errors without changing counters', () => {
		const cases: { metrics: Record<string, number>; status: string }[] = [
			{ metrics: {}, status: 'notReported' },
			{ metrics: { promptTokenCount: 0, completionTokens: 0, promptCacheTokenCount: 0 }, status: 'known' },
			{ metrics: { promptTokenCount: 100, completionTokens: 5, promptCacheTokenCount: 80 }, status: 'known' },
			{ metrics: { promptTokenCount: 100 }, status: 'partial' },
			{ metrics: { promptTokenCount: 0, completionTokens: NaN, promptCacheTokenCount: -1 }, status: 'partial' },
			{ metrics: { promptTokenCount: Infinity, completionTokens: NaN, promptCacheTokenCount: -1 }, status: 'notReported' },
		];
		for (const kind of ['response.success', 'response.error']) {
			for (const { metrics, status } of cases) {
				const telemetryService = new TestTelemetryService();
				const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
				forwarder.forward({
					sessionId: 'sdk-session',
					restricted: false,
					event: {
						kind,
						properties: { ahCorrelationOutcome: 'sdk-value', usageStatus: 'sdk-value' },
						metrics,
					},
				}, 'host-turn', { ahCorrelationOutcome: 'activeTurnFallback' });
				const data = telemetryService.events[0].data!;
				assert.strictEqual(data.usageStatus, status);
				assert.strictEqual(data.ahCorrelationOutcome, 'activeTurnFallback');
				assert.strictEqual(Object.hasOwn(data, 'correlationStatus'), false);
				for (const [key, value] of Object.entries(metrics)) {
					assert.strictEqual(data[key], value);
				}
				for (const key of ['promptTokenCount', 'completionTokens', 'promptCacheTokenCount']) {
					if (!Object.hasOwn(metrics, key)) {
						assert.strictEqual(Object.hasOwn(data, key), false);
					}
				}
			}
		}
	});

	test('does not emit restricted response metadata when restricted telemetry is disabled', () => {
		const telemetryService = new TestTelemetryService();
		const forwarder = new CopilotGitHubTelemetryForwarder(() => false, telemetryService);
		forwarder.forward({
			sessionId: 'sdk-session',
			restricted: true,
			event: { kind: 'response.error', properties: {}, metrics: {} },
		}, 'host-turn', { ahCorrelationOutcome: 'mappingAvailable' });
		assert.deepStrictEqual(telemetryService.events, []);
	});
});
