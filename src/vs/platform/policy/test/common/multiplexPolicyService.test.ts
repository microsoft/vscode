/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PolicyName } from '../../../../base/common/policy.js';
import { NullLogService } from '../../../log/common/log.js';
import { AbstractPolicyService, IPolicyService, PolicyDefinition, PolicyValue } from '../../common/policy.js';
import { MultiplexPolicyService } from '../../common/multiplexPolicyService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

class InMemoryPolicyService extends AbstractPolicyService implements IPolicyService {

	protected async _updatePolicyDefinitions(): Promise<void> { }

	setPolicyValue(name: PolicyName, value: PolicyValue): void {
		this.policies.set(name, value);
		this._onDidChange.fire([name]);
	}

	removePolicyValue(name: PolicyName): void {
		this.policies.delete(name);
		this._onDidChange.fire([name]);
	}

	registerDefinitions(defs: IStringDictionary<PolicyDefinition>): void {
		for (const key in defs) {
			this.policyDefinitions[key] = defs[key];
		}
	}
}

suite('MultiplexPolicyService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	test('first-wins: earlier service has higher priority', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		high.registerDefinitions({ PolicyA: { type: 'string' } });
		low.registerDefinitions({ PolicyA: { type: 'string' } });

		high.setPolicyValue('PolicyA', 'high-value');
		low.setPolicyValue('PolicyA', 'low-value');

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions({ PolicyA: { type: 'string' } });

		assert.strictEqual(multiplex.getPolicyValue('PolicyA'), 'high-value');
	});

	test('falls through to lower priority when higher has no value', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		high.registerDefinitions({ PolicyA: { type: 'string' } });
		low.registerDefinitions({ PolicyA: { type: 'string' } });

		low.setPolicyValue('PolicyA', 'low-value');

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions({ PolicyA: { type: 'string' } });

		assert.strictEqual(multiplex.getPolicyValue('PolicyA'), 'low-value');
	});

	test('propagates change events from child services', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		high.registerDefinitions({ PolicyA: { type: 'string' } });
		low.registerDefinitions({ PolicyA: { type: 'string' } });

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions({ PolicyA: { type: 'string' } });

		let changeCount = 0;
		disposables.add(multiplex.onDidChange(() => changeCount++));

		low.setPolicyValue('PolicyA', 'updated');
		assert.strictEqual(changeCount, 1);

		high.setPolicyValue('PolicyA', 'high-override');
		assert.strictEqual(changeCount, 2);
		assert.strictEqual(multiplex.getPolicyValue('PolicyA'), 'high-override');
	});

	test('handles multiple non-overlapping keys', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		high.registerDefinitions({ PolicyA: { type: 'string' } });
		low.registerDefinitions({ PolicyB: { type: 'boolean' } });

		high.setPolicyValue('PolicyA', 'value-a');
		low.setPolicyValue('PolicyB', true);

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions({
			PolicyA: { type: 'string' },
			PolicyB: { type: 'boolean' }
		});

		assert.deepStrictEqual(
			{
				a: multiplex.getPolicyValue('PolicyA'),
				b: multiplex.getPolicyValue('PolicyB'),
			},
			{
				a: 'value-a',
				b: true,
			}
		);
	});

	test('deny-sticky: denyValue from lower-priority service overrides higher-priority', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		const defs: IStringDictionary<PolicyDefinition> = {
			PolicyA: { type: 'string', denyValue: 'disable' }
		};
		high.registerDefinitions(defs);
		low.registerDefinitions(defs);

		high.setPolicyValue('PolicyA', 'allow');
		low.setPolicyValue('PolicyA', 'disable');

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions(defs);

		// Even though 'high' says 'allow', 'low' says 'disable' which is the denyValue — deny wins
		assert.strictEqual(multiplex.getPolicyValue('PolicyA'), 'disable');
	});

	test('deny-sticky: no override when denyValue is not present in any source', async () => {
		const high = disposables.add(new InMemoryPolicyService());
		const low = disposables.add(new InMemoryPolicyService());

		const defs: IStringDictionary<PolicyDefinition> = {
			PolicyA: { type: 'string', denyValue: 'disable' }
		};
		high.registerDefinitions(defs);
		low.registerDefinitions(defs);

		high.setPolicyValue('PolicyA', 'allow');
		low.setPolicyValue('PolicyA', 'also-allow');

		const multiplex = disposables.add(new MultiplexPolicyService([high, low], logService));
		await multiplex.updatePolicyDefinitions(defs);

		// No source provides the denyValue, so first-wins applies
		assert.strictEqual(multiplex.getPolicyValue('PolicyA'), 'allow');
	});
});
