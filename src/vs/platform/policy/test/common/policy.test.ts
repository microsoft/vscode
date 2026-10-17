/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { AbstractPolicyService, PolicyDefinition, PolicyValue, PolicyValueSource } from '../../common/policy.js';
import { PolicyChannelClient } from '../../common/policyIpc.js';

class TestPolicyService extends AbstractPolicyService {
	update(name: PolicyName, value: PolicyValue | undefined, source: PolicyValueSource | undefined): boolean {
		return this.updatePolicyValue(name, value, source);
	}

	protected async _updatePolicyDefinitions(_policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<void> {
		// no-op: the OS/file watcher is irrelevant for serialization tests
	}
}

suite('AbstractPolicyService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('serialize() omits the non-cloneable value callback so policiesData can be sent over IPC', async () => {
		const service = new TestPolicyService();

		await service.updatePolicyDefinitions({
			'WithCallback': {
				type: 'boolean',
				value: (policyData) => policyData.chat_preview_features_enabled === false ? false : undefined,
				restrictedValue: false,
			},
			'PlainDefinition': {
				type: 'string',
			}
		});

		const serialized = service.serialize();

		// The callback must not survive serialization...
		assert.strictEqual(typeof serialized['WithCallback'].definition.value, 'undefined');
		// ...while the structured-clone-safe metadata is preserved.
		assert.strictEqual(serialized['WithCallback'].definition.type, 'boolean');
		assert.strictEqual(serialized['WithCallback'].definition.restrictedValue, false);
		assert.strictEqual(serialized['PlainDefinition'].definition.type, 'string');

		// The whole payload must be structured-clone-safe (this is how it is delivered to the
		// renderer as part of the window configuration's policiesData).
		assert.doesNotThrow(() => structuredClone(serialized));

		service.dispose();
	});

	test('channel client omits non-cloneable value callbacks', async () => {
		let sentDefinitions: IStringDictionary<PolicyDefinition> | undefined;
		const channel: IChannel = {
			call: async <T>(_command: string, definitions?: unknown): Promise<T> => {
				sentDefinitions = definitions as IStringDictionary<PolicyDefinition>;
				structuredClone(definitions);
				return {} as T;
			},
			listen: () => Event.None
		};
		const client = new PolicyChannelClient({}, channel);

		await client.updatePolicyDefinitions({
			WithCallback: { type: 'boolean', value: () => false, restrictedValue: false }
		});

		assert.deepStrictEqual(sentDefinitions, {
			WithCallback: { type: 'boolean', managedSettings: undefined, restrictedValue: false }
		});
		client.dispose();
	});

	test('tracks value and source changes together', () => {
		const service = new TestPolicyService();
		const states: { changed: boolean; value: PolicyValue | undefined; source: PolicyValueSource | undefined }[] = [];
		const update = (value: PolicyValue | undefined, source: PolicyValueSource | undefined) => {
			const changed = service.update('Policy', value, source);
			states.push({
				changed,
				value: service.getPolicyValue('Policy'),
				source: service.getPolicyValueSource('Policy'),
			});
		};

		update(false, undefined);
		update(false, PolicyValueSource.Account);
		update(false, PolicyValueSource.AccountGate);
		update(false, PolicyValueSource.AccountGate);
		update(undefined, undefined);

		assert.deepStrictEqual(states, [
			{ changed: true, value: false, source: PolicyValueSource.Device },
			{ changed: true, value: false, source: PolicyValueSource.Account },
			{ changed: true, value: false, source: PolicyValueSource.AccountGate },
			{ changed: false, value: false, source: PolicyValueSource.AccountGate },
			{ changed: true, value: undefined, source: undefined },
		]);

		service.dispose();
	});
});
