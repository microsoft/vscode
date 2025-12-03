/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { autorun } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { TestHostService } from '../../../../test/browser/workbenchTestServices.js';
import { IHostService } from '../../../host/browser/host.js';
import { UserAttentionService } from '../../browser/userAttentionBrowser.js';

suite('UserAttentionService', () => {
	let userAttentionService: UserAttentionService2;
	let insta: TestInstantiationService;
	let clock: sinon.SinonFakeTimers;
	let hostService: TestHostService;
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_MINUTE = 60_000;
	const ATTENTION_TIMEOUT = 5_000; // USER_ATTENTION_TIMEOUT_MS is 5 seconds

	class UserAttentionService2 extends UserAttentionService {
		public override _markUserActivity(): void {
			super._markUserActivity();
		}
	}

	setup(() => {
		clock = sinon.useFakeTimers();
		insta = store.add(new TestInstantiationService());
		hostService = new TestHostService();
		insta.stub(IHostService, hostService);
		insta.stub(ILogService, new NullLogService());
		userAttentionService = store.add(insta.createInstance(UserAttentionService2));
	});

	teardown(() => {
		clock.restore();
	});

	test('isVsCodeFocused reflects window focus state', () => {
		assert.strictEqual(userAttentionService.isVsCodeFocused.get(), true);

		hostService.setFocus(false);
		assert.strictEqual(userAttentionService.isVsCodeFocused.get(), false);

		hostService.setFocus(true);
		assert.strictEqual(userAttentionService.isVsCodeFocused.get(), true);
	});

	test('hasUserAttention is true when focused and has recent activity', () => {
		// Initially focused with activity
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);
	});

	test('hasUserAttention becomes false after attention timeout without activity', () => {
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		// Advance time past the attention timeout (5 seconds)
		clock.tick(ATTENTION_TIMEOUT + 1);

		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);
	});

	test('hasUserAttention is false when window loses focus', () => {
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		hostService.setFocus(false);

		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);
	});

	test('hasUserAttention is restored when activity occurs', () => {
		// Wait for attention to expire
		clock.tick(ATTENTION_TIMEOUT + 1);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);

		// Simulate activity
		userAttentionService._markUserActivity();

		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);
	});

	test('userActivityDetected becomes true on markUserActivity and false after 500ms', () => {
		// Initially false (debounce timeout from constructor has passed or not yet triggered)
		// Clear any initial activity by advancing past debounce
		clock.tick(500);
		assert.strictEqual(userAttentionService.isUserActive.get(), false);

		// Mark activity - should become true
		userAttentionService._markUserActivity();
		assert.strictEqual(userAttentionService.isUserActive.get(), true);

		// Should still be true within 500ms
		clock.tick(400);
		assert.strictEqual(userAttentionService.isUserActive.get(), true);

		// Should become false after 500ms
		clock.tick(101);
		assert.strictEqual(userAttentionService.isUserActive.get(), false);
	});

	test('userActivityDetected debounces rapid activity', () => {
		// Clear initial activity
		clock.tick(500);

		let changeCount = 0;
		store.add(autorun(reader => {
			userAttentionService.isUserActive.read(reader);
			changeCount++;
		}));

		// Reset after initial autorun setup
		changeCount = 0;

		// Rapid activity - should only trigger once (true)
		userAttentionService._markUserActivity();
		userAttentionService._markUserActivity();
		userAttentionService._markUserActivity();

		// Only one change to true
		assert.strictEqual(changeCount, 1);
		assert.strictEqual(userAttentionService.isUserActive.get(), true);

		// After 500ms, changes to false
		clock.tick(500);
		assert.strictEqual(changeCount, 2);
		assert.strictEqual(userAttentionService.isUserActive.get(), false);
	});

	test('activity keeps attention alive', () => {
		// Start with attention
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		// Advance time halfway, then activity
		clock.tick(ONE_MINUTE / 2);
		userAttentionService._markUserActivity();

		// Advance another half minute - should still have attention
		clock.tick(ONE_MINUTE / 2);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		// Now let it expire
		clock.tick(ONE_MINUTE + 1);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);
	});

	test('DOM events trigger activity when focused', () => {
		// Wait for attention to expire
		clock.tick(ONE_MINUTE + 1);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);

		// Simulate keydown event
		document.dispatchEvent(new KeyboardEvent('keydown'));

		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);
	});

	test('DOM events do not trigger activity when not focused', () => {
		hostService.setFocus(false);

		// Wait for attention to expire
		clock.tick(ONE_MINUTE + 1);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);

		// Simulate keydown event while not focused
		document.dispatchEvent(new KeyboardEvent('keydown'));

		// Should still be false because window is not focused
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);
	});

	suite('fireAfterGivenFocusTimePassed', () => {
		test('fires callback after accumulated focus time', () => {
			let callbackFired = false;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(3 * ONE_MINUTE, () => {
				callbackFired = true;
			});
			store.add(disposable);

			// Mark activity to ensure attention is maintained, then advance 1 minute - not yet fired
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Mark activity and advance another minute - still not fired
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Mark activity and advance 3rd minute - should fire
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, true);
		});

		test('does not accumulate time when user has no attention', () => {
			let callbackFired = false;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(2 * ONE_MINUTE, () => {
				callbackFired = true;
			});
			store.add(disposable);

			// Mark activity and accumulate 1 minute
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Lose focus - should not accumulate (even with activity)
			hostService.setFocus(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Regain focus and activity, then tick - should fire
			hostService.setFocus(true);
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, true);
		});

		test('stops accumulating time when attention expires', () => {
			let callbackFired = false;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(2 * ONE_MINUTE, () => {
				callbackFired = true;
			});
			store.add(disposable);

			// Mark activity and accumulate 1 minute
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Let attention expire (don't mark activity before tick)
			// Advance enough time that the activity timeout expires
			clock.tick(ONE_MINUTE + 1);
			assert.strictEqual(userAttentionService.hasUserAttention.get(), false);
			assert.strictEqual(callbackFired, false);

			// This minute shouldn't count (no attention)
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Restore activity and accumulate 1 more minute
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, true);
		});

		test('can be disposed before callback fires', () => {
			let callbackFired = false;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(2 * ONE_MINUTE, () => {
				callbackFired = true;
			});

			// Mark activity and accumulate 1 minute
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Dispose before it fires
			disposable.dispose();

			// Advance past threshold - should not fire
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);
		});

		test('callback fires only once', () => {
			let callCount = 0;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(ONE_MINUTE, () => {
				callCount++;
			});
			store.add(disposable);

			// Mark activity and advance 1 minute - should fire
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callCount, 1);

			// Keep ticking, should not fire again
			userAttentionService._markUserActivity();
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callCount, 1);
		});
	});
});
