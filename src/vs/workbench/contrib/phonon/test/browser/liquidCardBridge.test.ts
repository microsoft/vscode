/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import {
	LiquidCardSlotHost,
	type ICardWebview,
	type ILiquidDataResolver,
	type CardToHostMessage,
	type HostToCardMessage,
} from '../../browser/liquidCardBridge.js';

/**
 * Mock ICardWebview -- records posted messages and exposes a fire() helper
 * to simulate messages arriving from the card webview.
 */
class MockCardWebview implements ICardWebview {
	private readonly _emitter = new Emitter<CardToHostMessage>();
	readonly onDidReceiveMessage = this._emitter.event;
	readonly posted: HostToCardMessage[] = [];

	async postMessage(msg: HostToCardMessage): Promise<boolean> {
		this.posted.push(msg);
		return true;
	}

	fire(msg: CardToHostMessage): void {
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

suite('LiquidCardSlotHost', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let webview: MockCardWebview;
	let resolver: MockDataResolver;
	let logService: NullLogService;

	setup(() => {
		webview = new MockCardWebview();
		resolver = new MockDataResolver();
		logService = new NullLogService();
	});

	teardown(() => {
		webview.dispose();
	});

	function createHost(
		cardId: string = 'card-1',
		entity?: string,
		params?: Record<string, unknown>,
	): LiquidCardSlotHost {
		const host = new LiquidCardSlotHost(webview, cardId, entity, params, resolver, logService);
		store.add(host);
		return host;
	}

	// ---- phonon:ready handler ----

	test('phonon:ready sends phonon:init with cardId and entity', async () => {
		createHost('card-1', 'dish');
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', cardId: 'card-1', entity: 'dish' },
		]);
	});

	test('phonon:ready with params sends phonon:init then phonon:params', async () => {
		createHost('card-2', 'order', { id: 42, filter: 'active' });
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', cardId: 'card-2', entity: 'order' },
			{ type: 'phonon:params', params: { id: 42, filter: 'active' } },
		]);
	});

	test('phonon:ready without params sends only phonon:init', async () => {
		createHost('card-3', 'supplier', undefined);
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.strictEqual(webview.posted.length, 1);
		assert.strictEqual(webview.posted[0].type, 'phonon:init');
	});

	test('phonon:ready with entity undefined sends phonon:init with entity undefined', async () => {
		createHost('card-4', undefined);
		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', cardId: 'card-4', entity: undefined },
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
		webview.fire({ type: 'phonon:unknownType' } as unknown as CardToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('message without type field does not throw', async () => {
		createHost();

		webview.fire({} as CardToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('null message does not throw', async () => {
		createHost();

		webview.fire(null as unknown as CardToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	test('undefined message does not throw', async () => {
		createHost();

		webview.fire(undefined as unknown as CardToHostMessage);
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});

	// ---- handleExternalMessage ----

	test('handleExternalMessage routes identically to internal listener', async () => {
		const host = createHost('ext-card', 'menu', { section: 'appetizers' });

		host.handleExternalMessage({ type: 'phonon:ready' });
		await tick();

		assert.deepStrictEqual(webview.posted, [
			{ type: 'phonon:init', cardId: 'ext-card', entity: 'menu' },
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

	// ---- Disposable ----

	test('after dispose messages are no longer handled', async () => {
		const host = createHost();
		host.dispose();

		webview.fire({ type: 'phonon:ready' });
		await tick();

		assert.strictEqual(webview.posted.length, 0);
	});
});
