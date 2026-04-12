/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { NullLogService } from '../../../platform/log/common/log.js';
import { ServerLifetimeService } from '../../node/serverLifetimeService.js';
suite('ServerLifetimeService', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    function create(opts = {}) {
        return ds.add(new ServerLifetimeService(opts, new NullLogService()));
    }
    test('starts with no active consumers', () => {
        const service = create();
        assert.strictEqual(service.hasActiveConsumers, false);
    });
    test('active() marks a consumer and dispose releases it', () => {
        const service = create();
        const d = service.active('test');
        assert.strictEqual(service.hasActiveConsumers, true);
        d.dispose();
        assert.strictEqual(service.hasActiveConsumers, false);
    });
    test('multiple active consumers require all to dispose', () => {
        const service = create();
        const d1 = service.active('a');
        const d2 = service.active('b');
        assert.strictEqual(service.hasActiveConsumers, true);
        d1.dispose();
        assert.strictEqual(service.hasActiveConsumers, true);
        d2.dispose();
        assert.strictEqual(service.hasActiveConsumers, false);
    });
    test('same consumer name counted multiple times', () => {
        const service = create();
        const d1 = service.active('ext');
        const d2 = service.active('ext');
        assert.strictEqual(service.hasActiveConsumers, true);
        d1.dispose();
        assert.strictEqual(service.hasActiveConsumers, true);
        d2.dispose();
        assert.strictEqual(service.hasActiveConsumers, false);
    });
    test('dispose is idempotent', () => {
        const service = create();
        const d1 = service.active('a');
        const d2 = service.active('a');
        d1.dispose();
        d1.dispose();
        assert.strictEqual(service.hasActiveConsumers, true);
        d2.dispose();
        assert.strictEqual(service.hasActiveConsumers, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VydmVyTGlmZXRpbWVTZXJ2aWNlLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXJ2ZXIvdGVzdC9ub2RlL3NlcnZlckxpZmV0aW1lU2VydmljZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDckUsT0FBTyxFQUEwQixxQkFBcUIsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXBHLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLEVBQUU7SUFDbkMsTUFBTSxFQUFFLEdBQUcsdUNBQXVDLEVBQUUsQ0FBQztJQUVyRCxTQUFTLE1BQU0sQ0FBQyxPQUErQixFQUFFO1FBQ2hELE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLHFCQUFxQixDQUFDLElBQUksRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQsSUFBSSxDQUFDLGlDQUFpQyxFQUFFLEdBQUcsRUFBRTtRQUM1QyxNQUFNLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUN6QixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7UUFDOUQsTUFBTSxPQUFPLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDekIsTUFBTSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqQyxNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRCxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDWixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7UUFDN0QsTUFBTSxPQUFPLEdBQUcsTUFBTSxFQUFFLENBQUM7UUFDekIsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvQixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQy9CLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JELEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JELEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNiLE1BQU0sQ0FBQyxXQUFXLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxNQUFNLE9BQU8sR0FBRyxNQUFNLEVBQUUsQ0FBQztRQUN6QixNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDckQsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2IsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLE1BQU0sT0FBTyxHQUFHLE1BQU0sRUFBRSxDQUFDO1FBQ3pCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDL0IsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvQixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRCxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDYixNQUFNLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=