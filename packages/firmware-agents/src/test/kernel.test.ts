/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ApprovalRequiredTool, withApproval } from '../kernel/approvalTool';
import { DisposableStore, toDisposable } from '../kernel/disposable';
import { validateJsonSchema } from '../kernel/jsonSchema';
import { MessageBus } from '../kernel/messageBus';
import { redactSecrets } from '../kernel/redact';
import { defineTool } from '../kernel/tool';
import { ToolRegistry } from '../kernel/toolRegistry';
import { CollaborationMessage } from '../orchestration/messages';

const tool = (name: string, risk: 'read' | 'write' | 'hardware' = 'read') =>
	defineTool({ name, description: name, risk, inputSchema: { type: 'object' }, invoke: async () => name });

suite('ToolRegistry', () => {

	test('registers, lists, unregisters and rejects duplicates and bad names', () => {
		const registry = new ToolRegistry();
		const reg = registry.register(tool('build'));
		registry.register(tool('flash', 'hardware'));
		assert.throws(() => registry.register(tool('build')), /already registered/);
		assert.throws(() => registry.register(tool('has space')), /Invalid tool name/);
		assert.deepStrictEqual(registry.list().map(t => t.name), ['build', 'flash']);
		reg.dispose();
		assert.deepStrictEqual(registry.list().map(t => t.name), ['flash']);
		assert.strictEqual(registry.get('build'), undefined);
	});

	test('views filter by name and risk and see tools registered later', () => {
		const registry = new ToolRegistry();
		registry.register(tool('read_memory'));
		const readOnly = registry.view({ risks: ['read'] });
		const named = registry.view({ names: ['flash'] });
		registry.register(tool('flash', 'hardware'));
		registry.register(tool('read_registers'));
		assert.deepStrictEqual(readOnly.list().map(t => t.name), ['read_memory', 'read_registers']);
		assert.strictEqual(readOnly.get('flash'), undefined);
		assert.deepStrictEqual(named.list().map(t => t.name), ['flash']);
	});
});

suite('withApproval', () => {

	test('wraps each tool once and keeps its metadata', () => {
		const [wrapped] = withApproval([tool('edit_file', 'write')]);
		assert.ok(wrapped instanceof ApprovalRequiredTool);
		assert.deepStrictEqual({ name: wrapped.name, risk: wrapped.risk }, { name: 'edit_file', risk: 'write' });
		assert.strictEqual(withApproval([wrapped])[0], wrapped);
	});
});

suite('validateJsonSchema', () => {

	const schema = {
		type: 'object',
		properties: {
			address: { type: 'integer', minimum: 0 },
			length: { type: 'integer', minimum: 1, maximum: 4096 },
			width: { enum: [8, 16, 32] },
			tags: { type: 'array', items: { type: 'string' } },
		},
		required: ['address', 'length'],
		additionalProperties: false,
	} as const;

	test('accepts valid input', () => {
		assert.deepStrictEqual(validateJsonSchema(schema, { address: 0x2000_0000, length: 16, width: 32, tags: ['ram'] }), []);
	});

	test('names every problem with its path', () => {
		assert.deepStrictEqual(validateJsonSchema(schema, { address: -1, length: 1.5, width: 64, tags: ['ok', 3], extra: true }), [
			'input.address must be >= 0',
			'input.length must be an integer',
			'input.width must be one of 8, 16, 32',
			'input.tags[1] must be a string',
			'input.extra is not allowed',
		]);
		assert.deepStrictEqual(validateJsonSchema(schema, {}), ['input.address is required', 'input.length is required']);
		assert.deepStrictEqual(validateJsonSchema(schema, []), ['input must be an object']);
	});
});

suite('MessageBus', () => {

	const failure: CollaborationMessage = { type: 'test-failure', bugId: 'b1', testName: 'uart_tx', level: 'host', message: 'expected 1' };

	test('delivers by type, isolates failing handlers and stops after dispose', () => {
		const errors: unknown[] = [];
		const bus = new MessageBus<CollaborationMessage>(err => errors.push(err));
		const seen: string[] = [];
		bus.subscribe('test-failure', () => { throw new Error('bad subscriber'); });
		const sub = bus.subscribe('test-failure', m => seen.push(m.testName));
		bus.subscribe('verification-result', () => seen.push('wrong type'));
		bus.publish(failure);
		sub.dispose();
		bus.publish(failure);
		assert.deepStrictEqual(seen, ['uart_tx']);
		assert.strictEqual(errors.length, 2);
	});

	test('waitFor resolves on the first matching message and rejects on abort', async () => {
		const bus = new MessageBus<CollaborationMessage>();
		const waiting = bus.waitFor('verification-result', m => m.bugId === 'b2');
		bus.publish({ type: 'verification-result', bugId: 'b1', passed: true, details: '' });
		bus.publish({ type: 'verification-result', bugId: 'b2', passed: false, details: 'still failing' });
		assert.strictEqual((await waiting).details, 'still failing');

		const controller = new AbortController();
		const aborted = bus.waitFor('debug-findings', undefined, controller.signal);
		controller.abort(new Error('cancelled'));
		await assert.rejects(aborted, /cancelled/);
	});
});

suite('redactSecrets', () => {

	test('removes configured secrets and known key formats', () => {
		const text = 'key=sk-or-v1-0123456789abcdef0123456789abcdef auth: Bearer abcdefghijklmnopqrstuvwxyz custom=hunter2hunter2 ant=sk-ant-api03-abcdefghijklmnopqrstu';
		assert.strictEqual(redactSecrets(text, ['hunter2hunter2']), 'key=*** auth: Bearer *** custom=*** ant=***');
	});

	test('leaves ordinary text alone', () => {
		assert.strictEqual(redactSecrets('RCC->APB1ENR = 0x00020000, task-stack 512'), 'RCC->APB1ENR = 0x00020000, task-stack 512');
	});
});

suite('DisposableStore', () => {

	test('disposes in reverse order, once, and disposes late additions immediately', () => {
		const order: number[] = [];
		const store = new DisposableStore();
		store.add(toDisposable(() => order.push(1)));
		store.add(toDisposable(() => order.push(2)));
		store.dispose();
		store.dispose();
		store.add(toDisposable(() => order.push(3)));
		assert.deepStrictEqual(order, [2, 1, 3]);
	});
});
