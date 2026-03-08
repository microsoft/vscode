/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { HooksManager } from '../src/hooks/HooksManager';

suite('HooksManager', () => {
	let hooks: HooksManager;

	setup(() => {
		hooks = new HooksManager();
	});

	test('trigger returns allow when no hooks registered', async () => {
		const result = await hooks.trigger('beforeAgentStart', {});
		assert.deepStrictEqual(result, { allow: true });
	});

	test('trigger calls registered hooks', async () => {
		let called = false;
		hooks.register({
			name: 'test-hook',
			event: 'beforeAgentStart',
			handler: async () => {
				called = true;
				return { allow: true };
			},
		});

		await hooks.trigger('beforeAgentStart', {});
		assert.strictEqual(called, true);
	});

	test('trigger stops on first blocking hook', async () => {
		const callOrder: string[] = [];

		hooks.register({
			name: 'blocker',
			event: 'beforeFileChange',
			handler: async () => {
				callOrder.push('blocker');
				return { allow: false, message: 'blocked' };
			},
		});

		hooks.register({
			name: 'after-blocker',
			event: 'beforeFileChange',
			handler: async () => {
				callOrder.push('after-blocker');
				return { allow: true };
			},
		});

		const result = await hooks.trigger('beforeFileChange', {});
		assert.deepStrictEqual(result, { allow: false, message: 'blocked' });
		assert.deepStrictEqual(callOrder, ['blocker']);
	});

	test('unregister removes a hook', async () => {
		hooks.register({
			name: 'temp-hook',
			event: 'afterAgentComplete',
			handler: async () => ({ allow: false, message: 'no' }),
		});

		hooks.unregister('temp-hook');
		const result = await hooks.trigger('afterAgentComplete', {});
		assert.deepStrictEqual(result, { allow: true });
	});
});
