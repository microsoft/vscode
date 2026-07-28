/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IMarkActiveOptions, IUserActivityService, UserActivityService } from '../../common/userActivityService.js';

const MARK_INACTIVE_DEBOUNCE = 10_000;

suite('UserActivityService', () => {
	let userActivityService: IUserActivityService;
	let clock: sinon.SinonFakeTimers;

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		clock = sinon.useFakeTimers();
		userActivityService = ds.add(new UserActivityService(ds.add(new TestInstantiationService())));
	});

	teardown(() => {
		clock.restore();
	});

	test('isActive should be true initially', () => {
		assert.ok(userActivityService.isActive);
	});

	test('markActive should be inactive when all handles gone', () => {
		const h1 = userActivityService.markActive();
		const h2 = userActivityService.markActive();
		assert.strictEqual(userActivityService.isActive, true);
		h1.dispose();
		assert.strictEqual(userActivityService.isActive, true);
		h2.dispose();
		clock.tick(MARK_INACTIVE_DEBOUNCE);
		assert.strictEqual(userActivityService.isActive, false);
	});

	test('markActive sets active whenHeldFor', async () => {
		userActivityService.markActive().dispose();
		clock.tick(MARK_INACTIVE_DEBOUNCE);

		const duration = 100; // milliseconds
		const opts: IMarkActiveOptions = { whenHeldFor: duration };
		const handle = userActivityService.markActive(opts);
		assert.strictEqual(userActivityService.isActive, false);
		clock.tick(duration - 1);
		assert.strictEqual(userActivityService.isActive, false);
		clock.tick(1);
		assert.strictEqual(userActivityService.isActive, true);
		handle.dispose();

		clock.tick(MARK_INACTIVE_DEBOUNCE);
		assert.strictEqual(userActivityService.isActive, false);
	});

	test('markActive whenHeldFor before triggers', async () => {
		userActivityService.markActive().dispose();
		clock.tick(MARK_INACTIVE_DEBOUNCE);

		const duration = 100; // milliseconds
		const opts: IMarkActiveOptions = { whenHeldFor: duration };
		userActivityService.markActive(opts).dispose();
		assert.strictEqual(userActivityService.isActive, false);
		clock.tick(duration + MARK_INACTIVE_DEBOUNCE);
		assert.strictEqual(userActivityService.isActive, false);
	});

	test('markActive with extendOnly only extends if already active', () => {
		// Make user inactive
		userActivityService.markActive().dispose();
		clock.tick(MARK_INACTIVE_DEBOUNCE);
		assert.strictEqual(userActivityService.isActive, false);

		// Should not activate if inactive and extendOnly is true
		const handle = userActivityService.markActive({ extendOnly: true });
		assert.strictEqual(userActivityService.isActive, false);
		handle.dispose();

		// Activate normally
		const h1 = userActivityService.markActive();
		assert.strictEqual(userActivityService.isActive, true);

		// Should extend activity if already active
		const h2 = userActivityService.markActive({ extendOnly: true });
		h1.dispose();
		// Still active because h2 is holding
		assert.strictEqual(userActivityService.isActive, true);
		h2.dispose();
		clock.tick(MARK_INACTIVE_DEBOUNCE);
		assert.strictEqual(userActivityService.isActive, false);
	});
});
