/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AgentHostConfigKey } from '../../../../../../platform/agentHost/common/agentHostCustomizationConfig.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ActionType } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { ROOT_STATE_URI, type RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentHostSignedOutCompatibilityContribution } from '../../../browser/agentSessions/agentHost/agentHostSignedOutCompatibilityContribution.js';

suite('AgentHostSignedOutCompatibilityContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const key = AgentHostConfigKey.AllowSignedOutWhenUsable;

	function createConnection(advertisesKey: boolean, value?: boolean) {
		const changed = store.add(new Emitter<RootState>());
		const root: RootState = {
			agents: [],
			config: { schema: { type: 'object', properties: advertisesKey ? { [key]: { type: 'boolean', title: 'Legacy Signed-Out Support' } } : {} }, values: { [key]: value } },
		};
		const dispatched: Parameters<IAgentConnection['dispatch']>[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override readonly rootState = {
				value: root,
				verifiedValue: root,
				onDidChange: changed.event,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			};
			override dispatch(...args: Parameters<IAgentConnection['dispatch']>): void {
				dispatched.push(args);
				const [, action] = args;
				if (action.type === ActionType.RootConfigChanged) {
					Object.assign(root.config!.values, action.config);
					changed.fire(root);
				}
			}
		}();
		return { connection, root, changed, dispatched };
	}

	function setup(connections: IAgentConnection[], initiallyEnabled = true) {
		const changed = store.add(new Emitter<void>());
		const enabled = observableValue('enabled', initiallyEnabled);
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IAgentHostEnablementService, { enabled });
		instantiation.stub(IAgentHostConnectionsService, {
			get connections() {
				return connections.map((connection, index) => ({ authority: String(index), address: index ? 'remote' : undefined, name: String(index), isAmbient: index === 0, connection }));
			},
			onDidChangeConnections: changed.event,
		});
		const contribution = store.add(instantiation.createInstance(AgentHostSignedOutCompatibilityContribution));
		return { changed, enabled, contribution };
	}

	test('enables both ambient and remote older hosts, including explicit false', () => {
		const ambient = createConnection(true);
		const remote = createConnection(true, false);
		setup([ambient.connection, remote.connection]);

		assert.deepStrictEqual([ambient.dispatched, remote.dispatched], [ambient, remote].map(() => [
			[ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { [key]: true } }],
		]));
	});

	test('does not send unknown keys to current or third-party hosts, or repeat true', () => {
		const current = createConnection(false);
		const enabled = createConnection(true, true);
		setup([current.connection, enabled.connection]);
		assert.deepStrictEqual([current.dispatched, enabled.dispatched], [[], []]);
	});

	test('retries after schema hydration without repushing an acknowledged value', () => {
		const host = createConnection(false);
		setup([host.connection]);
		host.root.config!.schema.properties[key] = { type: 'boolean', title: 'Legacy Signed-Out Support' };
		host.changed.fire(host.root);
		host.root.config!.values[key] = true;
		host.changed.fire(host.root);
		assert.strictEqual(host.dispatched.length, 1);
	});

	test('binds reconnects and disposes listeners from the previous connection', () => {
		const old = createConnection(true, true);
		const replacement = createConnection(true);
		const connections = [old.connection];
		const fixture = setup(connections);
		connections[0] = replacement.connection;
		fixture.changed.fire();
		old.root.config!.values[key] = false;
		old.changed.fire(old.root);
		assert.deepStrictEqual([old.dispatched.length, replacement.dispatched.length], [0, 1]);
	});

	test('waits for enablement and stops when disabled or disposed', () => {
		const host = createConnection(true);
		const fixture = setup([host.connection], false);
		const beforeEnable = host.dispatched.length;
		fixture.enabled.set(true, undefined);
		fixture.enabled.set(false, undefined);
		host.root.config!.values[key] = false;
		host.changed.fire(host.root);
		const afterDisable = host.dispatched.length;
		fixture.enabled.set(true, undefined);
		fixture.contribution.dispose();
		host.root.config!.values[key] = false;
		host.changed.fire(host.root);
		fixture.changed.fire();
		assert.deepStrictEqual([beforeEnable, afterDisable, host.dispatched.length], [0, 1, 2]);
	});
});
