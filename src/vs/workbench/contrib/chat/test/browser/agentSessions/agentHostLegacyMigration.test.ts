/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentSession, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { getTelemetryMigrationErrorMessage, getTelemetryMigrationSessionId } from '../../../../../../platform/agentHost/common/agentTelemetryCorrelation.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { adoptLegacyCopilotCliResource, reportLegacyMigrationOpen } from '../../../browser/agentSessions/agentHost/agentHostLegacyMigration.js';
import { COPILOT_CLI_AGENT_PROVIDER, COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from '../../../browser/copilotCliEventsUri.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../common/constants.js';

/** Migration enabled; the redirect is a no-op without it. */
const migrationOn: IConfigurationService = new TestConfigurationService({ [ChatConfiguration.MigrateLegacyCopilotCliSessions]: true });

suite('AgentHost legacy Copilot CLI migration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	/** Records probe outcomes so each path's telemetry can be asserted. */
	let outcomes: string[];
	let events: { name: string; data: Record<string, unknown>; error: boolean }[];
	let telemetry: ITelemetryService;
	setup(() => {
		outcomes = [];
		events = [];
		telemetry = new class extends mock<ITelemetryService>() {
			override publicLog2<E, C>(name: string, data?: E): void {
				outcomes.push((data as { outcome: string }).outcome);
				events.push({ name, data: data as Record<string, unknown>, error: false });
			}
			override publicLogError2<E, C>(name: string, data?: E): void {
				outcomes.push((data as { outcome: string }).outcome);
				events.push({ name, data: data as Record<string, unknown>, error: true });
			}
		};
	});
	const RAW_ID = 'sess-abc';
	const legacyResource = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` });
	const twinResource = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` });
	// AHP channels are backend session URIs (`<provider>:/<id>`) — subscribing with
	// the client-facing `agent-host-` scheme makes the host reject the channel.
	const backendChannel = AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER, RAW_ID);

	/** A subscription that either already carries state, or errors when probed. */
	function createConnection(outcome: 'adopted' | 'refused' | 'pending' | 'initialError' | 'noErrorEvent' | 'emptyState' | 'throw', errorMessage = 'session not found'): { connection: IAgentConnection; subscribed: URI[] } {
		const subscribed: URI[] = [];
		const errorEmitter = disposables.add(new Emitter<Error>());
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T>(_kind: never, resource: URI): IReference<IAgentSubscription<T>> {
				subscribed.push(resource);
				const error = new ProtocolError(-32001, errorMessage);
				if (outcome === 'throw') {
					throw error;
				}
				const changeEmitter = disposables.add(new Emitter<T>());
				if (outcome === 'refused') {
					queueMicrotask(() => errorEmitter.fire(error));
				}
				if (outcome === 'emptyState') {
					queueMicrotask(() => changeEmitter.fire({} as T));
				}
				const subscription = {
					value: outcome === 'adopted' ? ({} as T) : outcome === 'initialError' ? error : undefined,
					verifiedValue: undefined,
					onDidChange: changeEmitter.event,
					onDidError: outcome === 'noErrorEvent' ? undefined : errorEmitter.event,
					onWillApplyAction: Event.None,
					onDidApplyAction: Event.None,
				} satisfies IAgentSubscription<T>;
				return { object: subscription, dispose: () => { } };
			}
		};
		return { connection, subscribed };
	}

	test('redirects to the agent-host twin once the subscription carries state', async () => {
		const { connection, subscribed } = createConnection('adopted');

		const resolved = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');

		assert.deepStrictEqual(
			{ resolved: resolved?.toString(), subscribed: subscribed.map(s => s.toString()), outcomes },
			{ resolved: twinResource.toString(), subscribed: [backendChannel.toString()], outcomes: ['adopted'] },
		);
	});

	test('hashes the backend URI without exposing the session identifier', () => {
		assert.strictEqual(getTelemetryMigrationSessionId(backendChannel), '6a27283bcdda2b8d8ca87884c1ae452dcded34fc');
	});

	test('does not redirect when the subscription settles on an error', async () => {
		// `onDidChange` can land an Error in `value`; returning the twin then opens a
		// session the host refused, which fails outright instead of degrading.
		const changeEmitter = disposables.add(new Emitter<void>());
		const subscription = {
			value: undefined as unknown,
			verifiedValue: undefined,
			onDidChange: changeEmitter.event as Event<never>,
			onDidError: Event.None,
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T>(): IReference<IAgentSubscription<T>> {
				queueMicrotask(() => {
					subscription.value = new Error('refused');
					changeEmitter.fire();
				});
				return { object: subscription as IAgentSubscription<T>, dispose: () => { } };
			}
		};

		const resolved = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');
		assert.deepStrictEqual({
			resolved,
			events: events.map(({ error, data }) => ({ error, outcome: data.outcome, reason: data.reason, errorMessage: data.errorMessage })),
		}, {
			resolved: undefined,
			events: [{ error: true, outcome: 'declined', reason: 'stateChangeError', errorMessage: 'refused' }],
		});
	});

	test('redacts raw and encoded session identifiers without losing error context', () => {
		const resource = URI.from({ scheme: 'copilotcli', path: '/private session+id' });
		const error = new Error(`ENOENT: ${resource}; agent-host-copilotcli:/private%20session%2Bid; copilot:/private session+id; id=private session+id`);
		assert.deepStrictEqual({
			message: getTelemetryMigrationErrorMessage(error, resource),
			noError: getTelemetryMigrationErrorMessage(undefined, resource),
			original: error.message,
		}, {
			message: 'ENOENT: [REDACTED: session]; [REDACTED: session]; [REDACTED: session]; id=[REDACTED: session]',
			noError: undefined,
			original: `ENOENT: ${resource}; agent-host-copilotcli:/private%20session%2Bid; copilot:/private session+id; id=private session+id`,
		});
	});

	test('suppresses escaped and truncated invalid-path errors rather than retaining identifier fragments', () => {
		const messages = [
			'The argument \'path\' must be a string, Uint8Array, or URL without null bytes. Received \'/.copilot/session-state/private-prefix\\x00...\'',
			'The "path" argument must be of type string. Received "C:\\\\private-prefix\\\\..."',
			'Restore failed: The argument \'path\' is invalid. Received "/private-prefix..."',
		];
		const invalidArguments = ['ERR_INVALID_ARG_VALUE', 'ERR_INVALID_ARG_TYPE'].map(code =>
			Object.assign(new Error('Received an escaped, truncated private-prefix\\x00...'), { code }));
		const malformedIds = ['private-prefix\0suffix', 'private-prefix\nsuffix', 'private-prefix\uD800suffix', 'private-prefix\uDC00suffix', ''];
		assert.deepStrictEqual([
			...messages.flatMap(message => [message, new Error(message), { detail: { error: new Error(message) } }])
				.map(error => getTelemetryMigrationErrorMessage(error, backendChannel)),
			...invalidArguments.map(error => getTelemetryMigrationErrorMessage(error, backendChannel)),
			...malformedIds.map(id => getTelemetryMigrationErrorMessage(new Error('private-prefix...'), URI.from({ scheme: 'copilotcli', path: `/${id}` }))),
		], Array(messages.length * 3 + invalidArguments.length + malformedIds.length).fill('Migration error details redacted: invalid session identifier or argument.'));
	});

	test('preserves ordinary error context for well-formed Unicode identifiers', () => {
		const id = 'private-\u00E9-\u{1F600}';
		const resource = URI.from({ scheme: 'copilotcli', path: `/${id}` });
		assert.deepStrictEqual({
			message: getTelemetryMigrationErrorMessage(new Error(`ENOENT: ${resource}; id=${id}`), resource),
			noError: getTelemetryMigrationErrorMessage(undefined, URI.from({ scheme: 'copilotcli', path: '/\uD800' })),
		}, {
			message: 'ENOENT: [REDACTED: session]; id=[REDACTED: session]',
			noError: undefined,
		});
	});

	test('suppresses malformed-path messages in probe and open telemetry while preserving error codes', async () => {
		const message = 'The argument \'path\' must be a string, Uint8Array, or URL without null bytes. Received \'/private-prefix\\x00...\'';
		const { connection } = createConnection('initialError', message);
		await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');
		reportLegacyMigrationOpen(telemetry, 'restore', twinResource, false, new ProtocolError(-32603, message));
		assert.deepStrictEqual(events.map(({ name, data }) => ({
			name, reason: data.reason, errorCode: data.errorCode, errorMessage: data.errorMessage,
		})), [
			{ name: 'agentHost.legacyCopilotCliMigrationProbe', reason: 'initialStateError', errorCode: '-32001', errorMessage: 'Migration error details redacted: invalid session identifier or argument.' },
			{ name: 'agentHost.legacyCopilotCliMigrationOpen', reason: 'resolveFailed', errorCode: '-32603', errorMessage: 'Migration error details redacted: invalid session identifier or argument.' },
		]);
	});

	test('retries after a refusal instead of pinning the session to the legacy path', async () => {
		const { connection, subscribed } = createConnection('refused');

		const first = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');
		const second = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');

		// The host reports every restore failure as SessionNotFound, so a refusal
		// cannot be told apart from a transient one and must not be remembered.
		assert.deepStrictEqual(
			{ first, second, subscribes: subscribed.length, outcomes },
			{ first: undefined, second: undefined, subscribes: 2, outcomes: ['declined', 'declined'] },
		);
	});

	test('never probes a resource that is not a legacy Copilot CLI session', async () => {
		const { connection, subscribed } = createConnection('adopted');

		const resolved = await adoptLegacyCopilotCliResource(connection, twinResource, new NullLogService(), migrationOn, telemetry, 'open');

		// Not a migration opportunity at all, so it must not even be counted.
		assert.deepStrictEqual({ resolved, subscribed, outcomes }, { resolved: undefined, subscribed: [], outcomes: [] });
	});

	test('does nothing while the migration setting is off', async () => {
		const { connection, subscribed } = createConnection('adopted');
		const migrationOff: IConfigurationService = new TestConfigurationService();

		const resolved = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOff, telemetry, 'open');

		// The host restores a session whether or not it adopts it, so without this
		// gate a user who never opted in would still be moved onto the agent host.
		assert.deepStrictEqual({ resolved, subscribed, outcomes }, { resolved: undefined, subscribed: [], outcomes: ['settingDisabled'] });
	});

	test('declines without probing when there is no connection', async () => {
		assert.strictEqual(await adoptLegacyCopilotCliResource(undefined, legacyResource, new NullLogService(), migrationOn, telemetry, 'open'), undefined);
	});

	for (const { state, outcome, reason, hasError } of [
		{ state: 'refused', outcome: 'declined', reason: 'subscriptionError', hasError: true },
		{ state: 'initialError', outcome: 'declined', reason: 'initialStateError', hasError: true },
		{ state: 'noErrorEvent', outcome: 'declined', reason: 'missingErrorEvent', hasError: false },
		{ state: 'emptyState', outcome: 'declined', reason: 'emptyState', hasError: false },
		{ state: 'throw', outcome: 'failed', reason: 'exception', hasError: true },
	] as const) {
		test(`reports diagnostic details for ${reason}`, async () => {
			const { connection } = createConnection(state, `session not found: ${backendChannel}; frontend ${twinResource}; id ${RAW_ID}`);
			const resolved = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'restore', 100);
			const { durationMs, ...data } = events[0].data;
			assert.deepStrictEqual({ resolved, count: events.length, error: events[0].error, durationType: typeof durationMs, data }, {
				resolved: undefined,
				count: 1,
				error: hasError,
				durationType: 'number',
				data: {
					source: 'restore', outcome, reason,
					migrationSessionId: getTelemetryMigrationSessionId(backendChannel),
					errorCode: hasError ? '-32001' : undefined,
					errorMessage: hasError ? 'session not found: [REDACTED: session]; frontend [REDACTED: session]; id [REDACTED: session]' : undefined,
					settingEnabledAtStartup: true, settingEnabledNow: true, timeoutMs: 100,
				},
			});
		});
	}

	test('reports timeouts without inventing an error or an eligibility reason', async () => {
		await runWithFakedTimers({}, async () => {
			const { connection } = createConnection('pending');
			await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'restore', 10);
			const { durationMs, ...data } = events[0].data;
			assert.deepStrictEqual({ count: events.length, error: events[0].error, durationMs, data }, {
				count: 1, error: false, durationMs: 10,
				data: {
					source: 'restore', outcome: 'timedOut', reason: 'timedOut',
					migrationSessionId: getTelemetryMigrationSessionId(backendChannel),
					errorCode: undefined, errorMessage: undefined,
					settingEnabledAtStartup: true, settingEnabledNow: true, timeoutMs: 10,
				},
			});
		});
	});

	test('reports missing connections and disabled settings with session correlation', async () => {
		const { connection } = createConnection('pending');
		const migrationOff = new TestConfigurationService();
		await adoptLegacyCopilotCliResource(undefined, legacyResource, new NullLogService(), migrationOn, telemetry, 'open');
		await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOff, telemetry, 'open');
		assert.deepStrictEqual(events.map(({ data }) => ({
			reason: data.reason,
			migrationSessionId: data.migrationSessionId,
			settingEnabledAtStartup: data.settingEnabledAtStartup,
			settingEnabledNow: data.settingEnabledNow,
		})), [
			{ reason: 'noConnection', migrationSessionId: getTelemetryMigrationSessionId(backendChannel), settingEnabledAtStartup: true, settingEnabledNow: true },
			{ reason: 'settingDisabled', migrationSessionId: getTelemetryMigrationSessionId(backendChannel), settingEnabledAtStartup: false, settingEnabledNow: false },
		]);
	});

	test('correlates open failures and preserves exception details', () => {
		reportLegacyMigrationOpen(telemetry, 'open', twinResource, false);
		reportLegacyMigrationOpen(telemetry, 'restore', twinResource, false, new ProtocolError(-32603, `resolution failed for ${twinResource}; backend ${backendChannel}; id ${RAW_ID}`));
		assert.deepStrictEqual(events, [
			{
				name: 'agentHost.legacyCopilotCliMigrationOpen', error: false,
				data: { source: 'open', surfaced: false, migrationSessionId: getTelemetryMigrationSessionId(backendChannel), reason: 'sessionNotSurfaced', errorCode: undefined, errorMessage: undefined },
			},
			{
				name: 'agentHost.legacyCopilotCliMigrationOpen', error: true,
				data: { source: 'restore', surfaced: false, migrationSessionId: getTelemetryMigrationSessionId(backendChannel), reason: 'resolveFailed', errorCode: '-32603', errorMessage: 'resolution failed for [REDACTED: session]; backend [REDACTED: session]; id [REDACTED: session]' },
			},
		]);
	});
});
