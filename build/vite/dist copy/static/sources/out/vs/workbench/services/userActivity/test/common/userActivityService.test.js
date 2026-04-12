/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { UserActivityService } from '../../common/userActivityService.js';
const MARK_INACTIVE_DEBOUNCE = 10_000;
suite('UserActivityService', () => {
    let userActivityService;
    let clock;
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
        const opts = { whenHeldFor: duration };
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
        const opts = { whenHeldFor: duration };
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckFjdGl2aXR5U2VydmljZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJBY3Rpdml0eS90ZXN0L2NvbW1vbi91c2VyQWN0aXZpdHlTZXJ2aWNlLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxLQUFLLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDakMsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDekgsT0FBTyxFQUE0QyxtQkFBbUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXBILE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxDQUFDO0FBRXRDLEtBQUssQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7SUFDakMsSUFBSSxtQkFBeUMsQ0FBQztJQUM5QyxJQUFJLEtBQTRCLENBQUM7SUFFakMsTUFBTSxFQUFFLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVyRCxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsS0FBSyxHQUFHLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUM5QixtQkFBbUIsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksbUJBQW1CLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLHdCQUF3QixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDL0YsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcs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