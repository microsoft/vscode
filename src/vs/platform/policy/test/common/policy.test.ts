/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { AbstractPolicyService, PolicyDefinition, PolicyValue, PolicyValueSource } from '../../common/policy.js';
import { MultiplexPolicyService } from '../../common/multiplexPolicyService.js';
import { NullLogService } from '../../../log/common/log.js';

class TestPolicyService extends AbstractPolicyService {
	update(name: PolicyName, value: PolicyValue | undefined, source: PolicyValueSource | undefined): boolean {
		const changed = this.updatePolicyValue(name, value, source);
		if (changed) {
			this._onDidChange.fire([name]);
		}
		return changed;
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

	test('multiplex preserves all effective-value sources without changing last-wins precedence', async () => {
		const device = new TestPolicyService();
		const managed = new TestPolicyService();
		await device.updatePolicyDefinitions({ Policy: { type: 'boolean' } });
		await managed.updatePolicyDefinitions({ Policy: { type: 'boolean' } });
		device.update('Policy', false, PolicyValueSource.Device);
		managed.update('Policy', false, PolicyValueSource.NativeMdm);
		const multiplex = new MultiplexPolicyService([device, managed], new NullLogService());
		try {
			const read = () => ({ value: multiplex.getPolicyValue('Policy'), sources: multiplex.getPolicyValueSources('Policy') });
			const both = read();
			device.update('Policy', undefined, undefined);
			const removed = read();
			device.update('Policy', false, PolicyValueSource.Device);
			managed.update('Policy', true, PolicyValueSource.NativeMdm);
			const precedence = read();
			managed.update('Policy', undefined, undefined);
			assert.deepStrictEqual([both, removed, precedence, read()], [
				{ value: false, sources: [PolicyValueSource.Device, PolicyValueSource.NativeMdm] },
				{ value: false, sources: [PolicyValueSource.NativeMdm] },
				{ value: true, sources: [PolicyValueSource.NativeMdm] },
				{ value: false, sources: [PolicyValueSource.Device] },
			]);
		} finally {
			multiplex.dispose();
			managed.dispose();
			device.dispose();
		}
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
