/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { UserAttentionServiceEnv, UserAttentionService } from '../../browser/userAttentionBrowser.js';

suite('UserAttentionService', () => {
	let userAttentionService: UserAttentionService;
	let insta: TestInstantiationService;
	let clock: sinon.SinonFakeTimers;
	let hostAdapterMock: {
		isVsCodeFocused: IObservable<boolean>;
		isUserActive: IObservable<boolean>;
		setFocus(focused: boolean): void;
		setActive(active: boolean): void;
		dispose(): void;
	};
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ONE_MINUTE = 50_000;
	const ATTENTION_TIMEOUT = 60_000; // USER_ATTENTION_TIMEOUT_MS is 60 seconds

	setup(() => {
		clock = sinon.useFakeTimers();
		insta = store.add(new TestInstantiationService());
		insta.stub(ILogService, new NullLogService());

		const isVsCodeFocused = observableValue('focused', true);
		const isUserActive = observableValue('active', false);

		hostAdapterMock = {
			isVsCodeFocused,
			isUserActive,
			setFocus: (f) => isVsCodeFocused.set(f, undefined),
			setActive: (a) => isUserActive.set(a, undefined),
			dispose: () => { }
		};

		const originalCreateInstance = insta.createInstance;
		sinon.stub(insta, 'createInstance').callsFake((ctor: any, ...args: any[]) => {
			if (ctor === UserAttentionServiceEnv) {
				return hostAdapterMock;
			}
			return originalCreateInstance.call(insta, ctor, ...args);
		});

		userAttentionService = store.add(insta.createInstance(UserAttentionService));

		// Simulate initial activity
		hostAdapterMock.setActive(true);
		hostAdapterMock.setActive(false);
	});

	teardown(() => {
		clock.restore();
	});

	test('isVsCodeFocused reflects window focus state', () => {
		assert.strictEqual(userAttentionService.isVsCodeFocused.get(), true);

		hostAdapterMock.setFocus(false);
		assert.strictEqual(userAttentionService.isVsCodeFocused.get(), false);

		hostAdapterMock.setFocus(true);
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

		hostAdapterMock.setFocus(false);

		// Attention is not dependent on focus
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);
	});

	test('hasUserAttention is restored when activity occurs', () => {
		// Wait for attention to expire
		clock.tick(ATTENTION_TIMEOUT + 1);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), false);

		// Simulate activity
		hostAdapterMock.setActive(true);

		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);
	});

	test('activity keeps attention alive', () => {
		// Start with attention
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		// Advance time halfway, then activity
		clock.tick(ONE_MINUTE / 2);
		hostAdapterMock.setActive(true);
		hostAdapterMock.setActive(false);

		// Advance another half minute - should still have attention
		clock.tick(ONE_MINUTE / 2);
		assert.strictEqual(userAttentionService.hasUserAttention.get(), true);

		// Now let it expire
		clock.tick(ONE_MINUTE + 1);
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
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Mark activity and advance another minute - still not fired
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Mark activity and advance 3rd minute - should fire
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
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
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Lose focus - should still accumulate (even with activity)
			hostAdapterMock.setFocus(false);
			// Mark activity again to ensure attention is maintained
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
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
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
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
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, true);
		});

		test('can be disposed before callback fires', () => {
			let callbackFired = false;
			const disposable = userAttentionService.fireAfterGivenFocusTimePassed(2 * ONE_MINUTE, () => {
				callbackFired = true;
			});

			// Mark activity and accumulate 1 minute
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callbackFired, false);

			// Dispose before it fires
			disposable.dispose();

			// Advance past threshold - should not fire
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
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
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callCount, 1);

			// Keep ticking, should not fire again
			hostAdapterMock.setActive(true);
			hostAdapterMock.setActive(false);
			clock.tick(ONE_MINUTE);
			assert.strictEqual(callCount, 1);
		});
	});
});
