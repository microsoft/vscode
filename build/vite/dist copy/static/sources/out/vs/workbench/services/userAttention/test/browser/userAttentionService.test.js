/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { UserAttentionServiceEnv, UserAttentionService } from '../../browser/userAttentionBrowser.js';
suite('UserAttentionService', () => {
    let userAttentionService;
    let insta;
    let clock;
    let hostAdapterMock;
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
        sinon.stub(insta, 'createInstance').callsFake((ctor, ...args) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckF0dGVudGlvblNlcnZpY2UudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyQXR0ZW50aW9uL3Rlc3QvYnJvd3Nlci91c2VyQXR0ZW50aW9uU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEtBQUssS0FBSyxNQUFNLE9BQU8sQ0FBQztBQUMvQixPQUFPLEVBQWUsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDeEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUFFLFdBQVcsRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUN4RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUV0RyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ2xDLElBQUksb0JBQTBDLENBQUM7SUFDL0MsSUFBSSxLQUErQixDQUFDO0lBQ3BDLElBQUksS0FBNEIsQ0FBQztJQUNqQyxJQUFJLGVBTUgsQ0FBQztJQUNGLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxVQUFVLEdBQUcsTUFBTSxDQUFDO0lBQzFCLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxDQUFDLENBQUMsMENBQTBDO0lBRTVFLEtBQUssQ0FBQyxHQUFHLEVBQUU7UUFDVixLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQzlCLEtBQUssR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksd0JBQXdCLEVB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