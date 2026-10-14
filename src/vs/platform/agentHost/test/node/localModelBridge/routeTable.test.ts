/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ROUTE_EVICTION_GRACE_MS } from '../../../node/copilot/localModelBridge/shim/constants.js';
import { hashRouteToken, RouteTable, type IRouteRecordInit } from '../../../node/copilot/localModelBridge/shim/routeTable.js';
import { FakeClock, MAI_IDENTITY, EXAMPLE_IDENTITY } from './fakeServingAccess.js';

suite('LocalModel RouteTable', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function record(clock: FakeClock, overrides: Partial<IRouteRecordInit> = {}): IRouteRecordInit {
		return {
			fallback: { id: 'cloud-model' },
			serving: MAI_IDENTITY,
			capiOrigin: 'https://api.githubcopilot.com',
			accountGeneration: 1,
			expiresAt: clock.now() + 60_000,
			limits: { maxContextWindowTokens: 200000, maxPromptTokens: 148976, maxOutputTokens: 50000 },
			...overrides,
		};
	}

	test('binds a token to its record and leases it', () => {
		const clock = new FakeClock();
		const table = new RouteTable(clock);
		table.add('token-a', record(clock));
		const lease = table.acquire('token-a', 1);
		const leased = lease?.record.leases;
		lease?.dispose();
		lease?.dispose();
		assert.deepStrictEqual({
			serving: lease?.record.serving,
			createdAt: lease?.record.createdAt === clock.now(),
			leased,
			released: table.acquire('token-a', 1)?.record.leases,
			missing: table.acquire('token-b', 1),
		}, { serving: MAI_IDENTITY, createdAt: true, leased: 1, released: 1, missing: undefined });
	});

	test('treats records of an older account generation as missing', () => {
		const clock = new FakeClock();
		const table = new RouteTable(clock);
		table.add('token-a', record(clock, { accountGeneration: 1 }));
		const afterSwitch = table.acquire('token-a', 2);
		assert.deepStrictEqual({ afterSwitch, size: table.size }, { afterSwitch: undefined, size: 0 });
	});

	test('evicts only unleased records past expiry plus the grace period', () => {
		const clock = new FakeClock();
		const table = new RouteTable(clock);
		table.add('leased', record(clock));
		table.add('idle', record(clock));
		const lease = table.acquire('leased', 1);

		clock.advance(60_000 + ROUTE_EVICTION_GRACE_MS);
		table.sweep();
		const atGraceBoundary = table.size;
		clock.advance(1);
		table.sweep();
		const pastGrace = table.size;
		const leasedRecordServing = lease?.record.serving;
		lease?.dispose();
		table.sweep();
		assert.deepStrictEqual({ atGraceBoundary, pastGrace, leasedRecordServing, afterRelease: table.size }, {
			atGraceBoundary: 2,
			pastGrace: 1,
			leasedRecordServing: MAI_IDENTITY,
			afterRelease: 0,
		});
	});

	test('soft cap evicts the oldest unleased records', () => {
		const clock = new FakeClock();
		const table = new RouteTable(clock, 3);
		table.add('t1', record(clock));
		const leaseOnOldest = table.acquire('t1', 1);
		table.add('t2', record(clock));
		table.add('t3', record(clock));
		table.add('t4', record(clock));
		table.add('t5', record(clock));
		const present = ['t1', 't2', 't3', 't4', 't5'].filter(token => {
			const lease = table.acquire(token, 1);
			lease?.dispose();
			return !!lease;
		});
		leaseOnOldest?.dispose();
		assert.deepStrictEqual({ present, size: table.size }, { present: ['t1', 't4', 't5'], size: 3 });
	});

	test('counts live routes per serving generation', () => {
		const clock = new FakeClock();
		const table = new RouteTable(clock);
		table.add('mai-1', record(clock));
		table.add('mai-2', record(clock, { expiresAt: clock.now() + 1000 }));
		table.add('example', record(clock, { serving: EXAMPLE_IDENTITY }));
		table.add('old-account', record(clock, { accountGeneration: 0 }));
		const before = table.countLiveRoutes(MAI_IDENTITY.servingGeneration, 1);
		clock.advance(2000);
		assert.deepStrictEqual({ before, after: table.countLiveRoutes(MAI_IDENTITY.servingGeneration, 1), example: table.countLiveRoutes(EXAMPLE_IDENTITY.servingGeneration, 1) }, { before: 2, after: 1, example: 1 });
	});

	test('hashes tokens to a short prefix for logs', () => {
		const hash = hashRouteToken('secret-session-token');
		assert.deepStrictEqual({ shape: /^[0-9a-f]{8}$/.test(hash), stable: hash === hashRouteToken('secret-session-token'), distinct: hash !== hashRouteToken('other') }, { shape: true, stable: true, distinct: true });
	});
});
