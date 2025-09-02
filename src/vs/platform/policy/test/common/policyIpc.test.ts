/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IPolicyService, PolicyDefinition, PolicyValue } from '../../common/policy.js';
import { PolicyChannel } from '../../common/policyIpc.js';
import { PolicyName } from '../../../../base/common/policy.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

class TestPolicyService implements IPolicyService {
	readonly _serviceBrand: undefined;
	
	private readonly _onDidChange = new Emitter<readonly PolicyName[]>();
	readonly onDidChange = this._onDidChange.event;
	
	policyDefinitions: IStringDictionary<PolicyDefinition> = {};
	
	async updatePolicyDefinitions(policyDefinitions: IStringDictionary<PolicyDefinition>): Promise<IStringDictionary<PolicyValue>> {
		this.policyDefinitions = { ...this.policyDefinitions, ...policyDefinitions };
		return {};
	}
	
	getPolicyValue(name: PolicyName): PolicyValue | undefined {
		return undefined;
	}
	
	serialize(): IStringDictionary<{ definition: PolicyDefinition; value: PolicyValue }> | undefined {
		return undefined;
	}
	
	// Test helper method to trigger onDidChange event
	triggerPolicyChange(names: readonly PolicyName[]): void {
		this._onDidChange.fire(names);
	}
	
	dispose(): void {
		this._onDidChange.dispose();
	}
}

suite('PolicyChannel', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let policyService: TestPolicyService;
	let policyChannel: PolicyChannel;

	setup(() => {
		policyService = disposables.add(new TestPolicyService());
		policyChannel = disposables.add(new PolicyChannel(policyService));
	});

	test('should track disposables per client context', () => {
		const clientCtx1 = 'client1';
		const clientCtx2 = 'client2';
		
		// Listen to events from two different clients
		const event1 = policyChannel.listen(clientCtx1, 'onDidChange');
		const event2 = policyChannel.listen(clientCtx2, 'onDidChange');
		
		// Verify both clients can listen independently
		assert.ok(event1);
		assert.ok(event2);
		
		// Test that disposables are tracked separately
		// This is verified by checking that disposing one client doesn't affect the other
		let client1EventReceived = false;
		let client2EventReceived = false;
		
		const disposable1 = event1(() => { client1EventReceived = true; });
		const disposable2 = event2(() => { client2EventReceived = true; });
		
		// Trigger policy change
		policyService.triggerPolicyChange(['testPolicy']);
		
		// Both clients should receive the event
		assert.strictEqual(client1EventReceived, true);
		assert.strictEqual(client2EventReceived, true);
		
		// Reset flags
		client1EventReceived = false;
		client2EventReceived = false;
		
		// Dispose first client's subscription
		disposable1.dispose();
		
		// Trigger another policy change
		policyService.triggerPolicyChange(['testPolicy2']);
		
		// Only client2 should receive the event now
		assert.strictEqual(client1EventReceived, false);
		assert.strictEqual(client2EventReceived, true);
		
		disposable2.dispose();
	});

	test('should dispose all client resources when disposeClient is called', () => {
		const clientCtx = 'testClient';
		
		// Listen to events from the client
		const event = policyChannel.listen(clientCtx, 'onDidChange');
		
		let eventReceived = false;
		const disposable = event(() => { eventReceived = true; });
		
		// Trigger policy change to ensure listener is working
		policyService.triggerPolicyChange(['testPolicy']);
		assert.strictEqual(eventReceived, true);
		
		// Reset flag
		eventReceived = false;
		
		// Dispose client resources
		policyChannel.disposeClient(clientCtx);
		
		// Trigger another policy change
		policyService.triggerPolicyChange(['testPolicy2']);
		
		// Client should not receive the event since its resources were disposed
		assert.strictEqual(eventReceived, false);
		
		disposable.dispose();
	});

	test('should dispose all resources when dispose is called', () => {
		const clientCtx1 = 'client1';
		const clientCtx2 = 'client2';
		
		// Listen to events from two different clients
		const event1 = policyChannel.listen(clientCtx1, 'onDidChange');
		const event2 = policyChannel.listen(clientCtx2, 'onDidChange');
		
		let client1EventReceived = false;
		let client2EventReceived = false;
		
		const disposable1 = event1(() => { client1EventReceived = true; });
		const disposable2 = event2(() => { client2EventReceived = true; });
		
		// Dispose all resources
		policyChannel.dispose();
		
		// Trigger policy change
		policyService.triggerPolicyChange(['testPolicy']);
		
		// No clients should receive the event
		assert.strictEqual(client1EventReceived, false);
		assert.strictEqual(client2EventReceived, false);
		
		disposable1.dispose();
		disposable2.dispose();
	});

	test('should handle unknown events', () => {
		const clientCtx = 'testClient';
		
		assert.throws(() => {
			policyChannel.listen(clientCtx, 'unknownEvent');
		}, /Event not found: unknownEvent/);
	});

	test('should handle call method with context parameter', async () => {
		const clientCtx = 'testClient';
		const policyDefinitions = { testPolicy: { type: 'string' as const } };
		
		const result = await policyChannel.call(clientCtx, 'updatePolicyDefinitions', policyDefinitions);
		assert.deepStrictEqual(result, {});
		assert.deepStrictEqual(policyService.policyDefinitions.testPolicy, { type: 'string' });
	});

	test('should handle unknown commands', async () => {
		const clientCtx = 'testClient';
		
		await assert.rejects(async () => {
			await policyChannel.call(clientCtx, 'unknownCommand');
		}, /Call not found: unknownCommand/);
	});
});