/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import {
	LiquidMoleculeSlotHost,
	type IMoleculeWebview,
	type ILiquidDataResolver,
	type MoleculeToHostMessage,
	type HostToMoleculeMessage,
} from '../../browser/liquidMoleculeBridge.js';

/**
 * Mock IMoleculeWebview -- records posted messages and exposes a fire() helper
 * to simulate messages arriving from the molecule webview.
 */
class MockMoleculeWebview implements IMoleculeWebview {
	private readonly _emitter = new Emitter<MoleculeToHostMessage>();
	readonly onDidReceiveMessage = this._emitter.event;
	readonly posted: HostToMoleculeMessage[] = [];

	async postMessage(msg: HostToMoleculeMessage): Promise<boolean> {
		this.posted.push(msg);
		return true;
	}

	fire(msg: MoleculeToHostMessage): void {
		this._emitter.fire(msg);
	}

	dispose(): void {
		this._emitter.dispose();
	}
}

/**
 * Mock ILiquidDataResolver -- captures call arguments and allows
 * configuring return values / errors per-test.
 */
class MockDataResolver implements ILiquidDataResolver {
	declare readonly _serviceBrand: undefined;

	fetchResult: unknown[] = [];
	fetchError: Error | undefined;
	mutateError: Error | undefined;

	lastFetchEntity = '';
	lastFetchQuery: Record<string, unknown> | undefined;
	lastMutateEntity = '';
	lastMutateOp = '';
	lastMutateData: unknown;

	async fetch(entity: string, query?: Record<string, unknown>): Promise<unknown[]> {
		this.lastFetchEntity = entity;
		this.lastFetchQuery = query;
		if (this.fetchError) {
			throw this.fetchError;
		}
		return this.fetchResult;
	}

	async mutate(entity: string, operation: 'create' | 'update' | 'delete', data: unknown): Promise<void> {
		this.lastMutateEntity = entity;
		this.lastMutateOp = operation;
		this.lastMutateData = data;
		if (this.mutateError) {
			throw this.mutateError;
		}
	}
}

/** Wait one microtask so async _handleMessage settles. */
function tick(): Promise<void> {
	return new Promise(resolve => queueMicrotask(resolve));
}

suite('LiquidMoleculeSlotHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let webview: MockMoleculeWebview;
	let resolver: MockDataResolver;
	let logService: NullLogService;

	setup(() => {
		webview = new MockMoleculeWebview();
		resolver = new MockDataResolver();
		logService = new NullLogService();
	});

	teardown(() => {
		webview.dispose();
	});

	function createHost(
		moleculeId: string = 'molecule-1',
		entity?: string,
		params?: Record<string, unknown>,
	): LiquidMoleculeSlotHost {
		const host = new LiquidMoleculeSlotHost(webview, moleculeId, entity, params, resolver, logService);
		store.add(host);
		return host;
	}

	// ---- phonon:ready handler ----

	test('phonon:ready sends phonon:init with moleculeId and entity', async () => {
		createHost('molecule-1', 'dish');
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', moleculeId: 'molecule-1', entity: 'dish' },
		]);
	});

	test('phonon:ready with params sends phonon:init then phonon:params', async () => {
		createHost('molecule-2', 'order', { id: 42, filter: 'active' });
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', moleculeId: 'molecule-2', entity: 'order' },
			{ type: 'phonon:params', params: { id: 42, filter: 'active' } },
		]);
	});

	test('phonon:ready without params sends only phonon:init', async () => {
		createHost('molecule-3', 'supplier', undefined);
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.strictEqual(webview.posted.length, 1);
		assert.strictEqual(webview.posted[0].type, 'phonon:init');
	});

	test('phonon:ready with entity undefined sends phonon:init with entity undefined', async () => {
		createHost('molecule-4', undefined);
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', moleculeId: 'molecule-4', entity: undefined },
		]);
	});

	// ---- phonon:data:fetch handler ----

	test('phonon:data:fetch calls resolver.fetch and posts success response', async () => {
		createHost();
		resolver.fetchResult = [{ id: 1, name: 'Pasta' }, { id: 2, name: 'Pizza' }];

		webview.fire({
			type: 'phonon:data:fetch',
			requestId: 'req-1',
			entity: 'dish',
			query: { limit: 10 },
		});
		await tick();

		assert.strictEqual(resolver.lastFetchEntity, 'dish');
		assert.deepStrictEqual(resolver.lastFetchQuery, { limit: 10 });
		assert.deepStrictEqual(webview.posted, [{
			type: 'phonon:data:response',
			requestId: 'req-1',
			success: true,
			data: [{ id: 1, name: 'Pasta' }, { id: 2, name: 'Pizza' }],
		}]);
	});

	test('phonon:data:fetch with resolver error posts error response', async () => {
		createHost();
		resolver.fetchError = new Error('DB connection failed');

		webview.fire({
			type: 'phonon:data:fetch',
			requestId: 'req-2',
			entity: 'dish',
		});
		await tick();

		assert.strictEqual(webview.posted.length, 1);
		const response = webview.posted[0];
		assert.strictEqual(response.type, 'phonon:data:response');
		if (response.type === 'phonon:data:response') {
			assert.strictEqual(response.requestId, 'req-2');
			assert.strictEqual(response.success, false);
			assert.ok(response.error?.includes('DB connection failed'));
		}
	});

	test('phonon:data:fetch with no query calls resolver with undefined query', async () => {
		createHost();
		resolver.fetchResult = [];

		webview.fire({
			type: 'phonon:data:fetch',
			requestId: 'req-3',
			entity: 'ingredient',
		});
		await tick();

		assert.strictEqual(resolver.lastFetchEntity, 'ingredient');
		assert.strictEqual(resolver.lastFetchQuery, undefined);
		assert.deepStrictEqual(webview.posted, [{
			type: 'phonon:data:response',
			requestId: 'req-3',
			success: true,
			data: [],
		}]);
	});

	// ---- phonon:data:mutate handler ----

	test('phonon:data:mutate create calls resolver.mutate and posts success', async () => {
		createHost();

		webview.fire({
			type: 'phonon:data:mutate',
			requestId: 'req-4',
			entity: 'dish',
			operation: 'create',
			data: { name: 'Risotto', cost: 8.5 },
		});
		await tick();

		assert.strictEqual(resolver.lastMutateEntity, 'dish');
		assert.strictEqual(resolver.lastMutateOp, 'create');
		assert.deepStrictEqual(resolver.lastMutateData, { name: 'Risotto', cost: 8.5 });
		assert.deepStrictEqual(webview.posted, [{
			type: 'phonon:data:response',
			requestId: 'req-4',
			success: true,
		}]);
	});

	test('phonon:data:mutate with resolver error posts error response', async () => {
		createHost();
		resolver.mutateError = new Error('Constraint violation');

		webview.fire({
			type: 'phonon:data:mutate',
			requestId: 'req-5',
			entity: 'order',
			operation: 'update',
			data: { status: 'shipped' },
		});
		await tick();

		assert.strictEqual(webview.posted.length, 1);
		const response = webview.posted[0];
		assert.strictEqual(response.type, 'phonon:data:response');
		if (response.type === 'phonon:data:response') {
			assert.strictEqual(response.requestId, 'req-5');
			assert.strictEqual(response.success, false);
			assert.ok(response.error?.includes('Constraint violation'));
		}
	});

	// ---- phonon:navigate / phonon:intent ----

	test('phonon:navigate does not throw and posts no response', async () => {
		createHost();

		webview.fire({
			type: 'phonon:navigate',
			viewId: 'dishDetail',
			params: { id: 42 },
		});
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('phonon:intent does not throw and posts no response', async () => {
		createHost();

		webview.fire({
			type: 'phonon:intent',
			description: 'Show me the revenue chart',
		});
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	// ---- phonon:setTitle / phonon:setLoading ----

	test('phonon:setTitle does not throw', async () => {
		createHost();

		webview.fire({ type: 'phonon:setTitle', title: 'New Title' });
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('phonon:setLoading does not throw', async () => {
		createHost();

		webview.fire({ type: 'phonon:setLoading', loading: true });
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	// ---- Edge cases ----

	test('unknown message type does not throw and posts no response', async () => {
		createHost();

		// Force a message with an unknown phonon: type through the typed system
		webview.fire({ type: 'phonon:unknownType' } as unknown as MoleculeToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('message without type field does not throw', async () => {
		createHost();

		webview.fire({} as MoleculeToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('null message does not throw', async () => {
		createHost();

		webview.fire(null as unknown as MoleculeToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('undefined message does not throw', async () => {
		createHost();

		webview.fire(undefined as unknown as MoleculeToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	// ---- handleExternalMessage ----

	test('handleExternalMessage routes identically to internal listener', async () => {
		const host = createHost('ext-molecule', 'menu', { section: 'appetizers' });

		host.handleExternalMessage({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', moleculeId: 'ext-molecule', entity: 'menu' },
			{ type: 'phonon:params', params: { section: 'appetizers' } },
		]);
	});

	test('handleExternalMessage routes fetch to resolver', async () => {
		const host = createHost();
		resolver.fetchResult = [{ id: 99 }];

		host.handleExternalMessage({
			type: 'phonon:data:fetch',
			requestId: 'ext-req-1',
			entity: 'supplier',
			query: { active: true },
		});
		await tick();

		assert.strictEqual(resolver.lastFetchEntity, 'supplier');
		assert.deepStrictEqual(resolver.lastFetchQuery, { active: true });
		assert.deepStrictEqual(webview.posted, [{
			type: 'phonon:data:response',
			requestId: 'ext-req-1',
			success: true,
			data: [{ id: 99 }],
		}]);
	});

	// ---- phonon:setState ----

	test('phonon:setState fires onDidStateChange with molecule id, key, and value', async () => {
		const host = createHost('state-mol', 'order');
		const stateChanges: Array<{ moleculeId: string; key: string; value: unknown }> = [];
		store.add(host.onDidStateChange(change => stateChanges.push(change)));

		webview.fire({ type: 'phonon:setState', key: 'orderCount', value: 42 });
		await tick();

		assert.deepStrictEqual(stateChanges, [
			{ moleculeId: 'state-mol', key: 'orderCount', value: 42 },
		]);
		assert.strictEqual(webview.posted.length, 0);
	});

	test('phonon:setState fires multiple times for multiple keys', async () => {
		const host = createHost('multi-state');
		const stateChanges: Array<{ moleculeId: string; key: string; value: unknown }> = [];
		store.add(host.onDidStateChange(change => stateChanges.push(change)));

		webview.fire({ type: 'phonon:setState', key: 'loading', value: true });
		webview.fire({ type: 'phonon:setState', key: 'count', value: 5 });
		await tick();

		assert.strictEqual(stateChanges.length, 2);
		assert.strictEqual(stateChanges[0].key, 'loading');
		assert.strictEqual(stateChanges[1].key, 'count');
	});

	test('pushState sends phonon:stateUpdate to molecule', () => {
		const host = createHost('push-mol');
		const state = { orderCount: 42, loading: false };

		host.pushState(state);

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:stateUpdate', state },
		]);
	});

	// ---- Disposable ----

	test('after dispose messages are no longer handled', async () => {
		const host = createHost();
		host.dispose();

		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});
});
