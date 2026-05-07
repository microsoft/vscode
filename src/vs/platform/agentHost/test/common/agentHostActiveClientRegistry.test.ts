/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostActiveClientRegistry, IActiveClientBundle, IActiveClientResolver } from '../../common/agentHostActiveClientRegistry.js';

suite('AgentHostActiveClientRegistry', () => {

	let store: DisposableStore;
	let reg: AgentHostActiveClientRegistry;

	setup(() => {
		store = new DisposableStore();
		reg = new AgentHostActiveClientRegistry();
	});

	teardown(() => {
		store.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolve returns undefined when no resolver is registered', () => {
		assert.strictEqual(reg.resolve('client-a', 'copilot'), undefined);
	});

	test('register-resolve roundtrip returns the bundle', () => {
		const bundle: IActiveClientBundle = { tools: [], customizations: [{ uri: 'vscode://x/y', displayName: 'b' }] };
		store.add(reg.registerResolver('client-a', 'copilot', () => bundle));
		assert.deepStrictEqual(reg.resolve('client-a', 'copilot'), bundle);
	});

	test('disposing a registration removes the entry', () => {
		const d = reg.registerResolver('client-a', 'copilot', () => ({ tools: [] }));
		d.dispose();
		assert.strictEqual(reg.resolve('client-a', 'copilot'), undefined);
	});

	test('re-registering the same key replaces the resolver', () => {
		const first: IActiveClientResolver = () => ({ tools: [], customizations: [{ uri: 'a:/1', displayName: 'first' }] });
		const second: IActiveClientResolver = () => ({ tools: [], customizations: [{ uri: 'a:/2', displayName: 'second' }] });
		store.add(reg.registerResolver('client-a', 'copilot', first));
		store.add(reg.registerResolver('client-a', 'copilot', second));
		assert.deepStrictEqual(reg.resolve('client-a', 'copilot')?.customizations?.[0].displayName, 'second');
	});

	test('disposing an old registration after replacement is a no-op', () => {
		const firstDisp = reg.registerResolver('client-a', 'copilot', () => ({ tools: [], customizations: [{ uri: 'a:/1', displayName: 'first' }] }));
		store.add(reg.registerResolver('client-a', 'copilot', () => ({ tools: [], customizations: [{ uri: 'a:/2', displayName: 'second' }] })));
		firstDisp.dispose();
		assert.deepStrictEqual(reg.resolve('client-a', 'copilot')?.customizations?.[0].displayName, 'second');
	});

	test('separate (clientId, provider) keys are independent', () => {
		store.add(reg.registerResolver('client-a', 'copilot', () => ({ tools: [], customizations: [{ uri: 'a:/copilot-a', displayName: 'a-copilot' }] })));
		store.add(reg.registerResolver('client-a', 'claude', () => ({ tools: [], customizations: [{ uri: 'a:/claude-a', displayName: 'a-claude' }] })));
		store.add(reg.registerResolver('client-b', 'copilot', () => ({ tools: [], customizations: [{ uri: 'a:/copilot-b', displayName: 'b-copilot' }] })));

		assert.strictEqual(reg.resolve('client-a', 'copilot')?.customizations?.[0].displayName, 'a-copilot');
		assert.strictEqual(reg.resolve('client-a', 'claude')?.customizations?.[0].displayName, 'a-claude');
		assert.strictEqual(reg.resolve('client-b', 'copilot')?.customizations?.[0].displayName, 'b-copilot');
	});

	test('resolver is invoked on every resolve (returns latest)', () => {
		let calls = 0;
		store.add(reg.registerResolver('client-a', 'copilot', () => {
			calls++;
			return { tools: [], customizations: [{ uri: `a:/${calls}`, displayName: String(calls) }] };
		}));
		reg.resolve('client-a', 'copilot');
		reg.resolve('client-a', 'copilot');
		assert.strictEqual(calls, 2);
	});
});
