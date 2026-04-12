/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { resolveWorkbenchCommonProperties } from '../../browser/workbenchCommonProperties.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hasKey } from '../../../../../base/common/types.js';
suite('Browser Telemetry - common properties', function () {
    let testStorageService;
    teardown(() => {
        testStorageService.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        testStorageService = new InMemoryStorageService();
    });
    test('mixes in additional properties', async function () {
        const resolveCommonTelemetryProperties = () => {
            return {
                'userId': '1'
            };
        };
        const props = resolveWorkbenchCommonProperties(testStorageService, undefined, false, undefined, resolveCommonTelemetryProperties);
        assert.ok(hasKey(props, {
            commitHash: true,
            sessionID: true,
            timestamp: true,
            'common.platform': true,
            'common.timesincesessionstart': true,
            'common.sequence': true,
            version: true,
            'common.firstSessionDate': true,
            'common.lastSessionDate': true,
            'common.isNewSession': true,
            'common.machineId': true
        }));
        assert.strictEqual(props['userId'], '1');
    });
    test('mixes in additional dyanmic properties', async function () {
        let i = 1;
        const resolveCommonTelemetryProperties = () => {
            return Object.defineProperties({}, {
                'userId': {
                    get: () => {
                        return i++;
                    },
                    enumerable: true
                }
            });
        };
        const props = resolveWorkbenchCommonProperties(testStorageService, undefined, false, undefined, resolveCommonTelemetryProperties);
        assert.strictEqual(props['userId'], 1);
        const props2 = resolveWorkbenchCommonProperties(testStorageService, undefined, false, undefined, resolveCommonTelemetryProperties);
        assert.strictEqual(props2['userId'], 2);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uUHJvcGVydGllcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RlbGVtZXRyeS90ZXN0L2Jyb3dzZXIvY29tbW9uUHJvcGVydGllcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM5RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFN0QsS0FBSyxDQUFDLHVDQUF1QyxFQUFFO0lBQzlDLElBQUksa0JBQTBDLENBQUM7SUFFL0MsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysa0JBQWtCLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO0lBQ25ELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEtBQUs7UUFDM0MsTUFBTSxnQ0FBZ0MsR0FBRyxHQUFHLEVBQUU7WUFDN0MsT0FBTztnQkFDTixRQUFRLEVBQUUsR0FBRzthQUNiLENBQUM7UUFDSCxDQUFDLENBQUM7UUFFRixNQUFNLEtBQUssR0FBRyxnQ0FBZ0MsQ0FBQyxrQkFBa0IsRUFBRSxTQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1FBRW5JLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRTtZQUN2QixVQUFVLEVBQUUsSUFBSTtZQUNoQixTQUFTLEVBQUUsSUFBSTtZQUNmLFNBQVMsRUFBRSxJQUFJO1lBQ2YsaUJBQWlCLEVBQUUsSUFBSTtZQUN2Qiw4QkFBOEIsRUFBRSxJQUFJO1lBQ3BDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsT0FBTyxFQUFFLElBQUk7WUFDYix5QkFBeUIsRUFBRSxJQUFJO1lBQy9CLHdCQUF3QixFQUFFLElBQUk7WUFDOUIscUJBQXFCLEVBQUUsSUFBSTtZQUMzQixrQkFBa0IsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQyxDQUFDO1FBQ0osTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDMUMsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsd0NBQXdDLEVBQUUsS0FBSztRQUNuRCxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDVixNQUFNLGdDQUFnQyxHQUFHLEdBQUcsRUFBRTtZQUM3QyxPQUFPLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEVBQUU7Z0JBQ2xDLFFBQVEsRUFBRTtvQkFDVCxHQUFHLEVBQUUsR0FBRyxFQUFFO3dCQUNULE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ1osQ0FBQztvQkFDRCxVQUFVLEVBQUUsSUFBSTtpQkFDaEI7YUFDRCxDQUFDLENBQUM7UUFDSixDQUFDLENBQUM7UUFFRixNQUFNLEtBQUssR0FBRyxnQ0FBZ0MsQ0FBQyxrQkFBa0IsRUFBRSxTQUFVLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQ25JLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBRXZDLE1BQU0sTUFBTSxHQUFHLGdDQUFnQyxDQUFDLGtCQUFrQixFQUFFLFNBQVUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLGdDQUFnQyxDQUFDLENBQUM7UUFDcEksTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDekMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQyJ9