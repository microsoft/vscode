/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { AgentSession, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { adoptLegacyCopilotCliResource } from '../../../browser/agentSessions/agentHost/agentHostLegacyMigration.js';
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
	let telemetry: ITelemetryService;
	setup(() => {
		outcomes = [];
		telemetry = new class extends mock<ITelemetryService>() {
			override publicLog2<E, C>(_name: string, data?: E): void {
				outcomes.push((data as { outcome: string }).outcome);
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
	function createConnection(outcome: 'adopted' | 'refused' | 'pending'): { connection: IAgentConnection; subscribed: URI[] } {
		const subscribed: URI[] = [];
		const errorEmitter = disposables.add(new Emitter<Error>());
		const connection = new class extends mock<IAgentConnection>() {
			override getSubscription<T>(_kind: never, resource: URI): IReference<IAgentSubscription<T>> {
				subscribed.push(resource);
				if (outcome === 'refused') {
					queueMicrotask(() => errorEmitter.fire(new Error('session not found')));
				}
				const subscription = {
					value: outcome === 'adopted' ? ({} as T) : undefined,
					verifiedValue: undefined,
					onDidChange: Event.None,
					onDidError: errorEmitter.event,
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

		assert.strictEqual(await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), migrationOn, telemetry, 'open'), undefined);
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
});
