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
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { adoptLegacyCopilotCliResource } from '../../../browser/agentSessions/agentHost/agentHostLegacyMigration.js';
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from '../../../browser/copilotCliEventsUri.js';

suite('AgentHost legacy Copilot CLI migration', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const RAW_ID = 'sess-abc';
	const legacyResource = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` });
	const twinResource = URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` });

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

		const resolved = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService());

		assert.deepStrictEqual(
			{ resolved: resolved?.toString(), subscribed: subscribed.map(s => s.toString()) },
			{ resolved: twinResource.toString(), subscribed: [twinResource.toString()] },
		);
	});

	test('declines when the host refuses the twin, and remembers the refusal', async () => {
		const { connection, subscribed } = createConnection('refused');
		const declined = new Set<string>();

		const first = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), declined);
		const second = await adoptLegacyCopilotCliResource(connection, legacyResource, new NullLogService(), declined);

		// A refused session must not pay a round-trip on every subsequent open.
		assert.deepStrictEqual(
			{ first, second, subscribes: subscribed.length, declined: [...declined] },
			{ first: undefined, second: undefined, subscribes: 1, declined: [RAW_ID] },
		);
	});

	test('never probes a resource that is not a legacy Copilot CLI session', async () => {
		const { connection, subscribed } = createConnection('adopted');

		const resolved = await adoptLegacyCopilotCliResource(connection, twinResource, new NullLogService());

		assert.deepStrictEqual({ resolved, subscribed }, { resolved: undefined, subscribed: [] });
	});

	test('declines without probing when there is no connection', async () => {
		assert.strictEqual(await adoptLegacyCopilotCliResource(undefined, legacyResource, new NullLogService()), undefined);
	});
});
