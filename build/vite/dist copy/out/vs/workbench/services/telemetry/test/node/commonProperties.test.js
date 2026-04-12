/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { release, hostname } from 'os';
import { resolveWorkbenchCommonProperties } from '../../common/workbenchCommonProperties.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { timeout } from '../../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { hasKey } from '../../../../../base/common/types.js';
suite('Telemetry - common properties', function () {
    let testStorageService;
    teardown(() => {
        testStorageService.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        testStorageService = new InMemoryStorageService();
    });
    test('default', function () {
        const props = resolveWorkbenchCommonProperties(testStorageService, undefined, release(), hostname(), 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
        assert.ok(hasKey(props, {
            commitHash: true,
            sessionID: true,
            timestamp: true,
            'common.platform': true,
            'common.nodePlatform': true,
            'common.nodeArch': true,
            'common.timesincesessionstart': true,
            'common.sequence': true,
            // 'common.version.shell': true, // only when running on electron
            // 'common.version.renderer': true,
            'common.platformVersion': true,
            version: true,
            'common.releaseDate': true,
            'common.firstSessionDate': true,
            'common.lastSessionDate': true,
            'common.isNewSession': true,
            'common.machineId': true
        }));
    });
    test('lastSessionDate when available', function () {
        testStorageService.store('telemetry.lastSessionDate', new Date().toUTCString(), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        const props = resolveWorkbenchCommonProperties(testStorageService, undefined, release(), hostname(), 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
        assert.ok(props['common.lastSessionDate']); // conditional, see below
        assert.ok(props['common.isNewSession']);
        assert.strictEqual(props['common.isNewSession'], '0');
    });
    test('values chance on ask', async function () {
        const props = resolveWorkbenchCommonProperties(testStorageService, undefined, release(), hostname(), 'someMachineId', 'someSqmId', 'somedevDeviceId', false, process);
        let value1 = props['common.sequence'];
        let value2 = props['common.sequence'];
        assert.ok(value1 !== value2, 'seq');
        value1 = props['timestamp'];
        value2 = props['timestamp'];
        assert.ok(value1 !== value2, 'timestamp');
        value1 = props['common.timesincesessionstart'];
        await timeout(10);
        value2 = props['common.timesincesessionstart'];
        assert.ok(value1 !== value2, 'timesincesessionstart');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbW9uUHJvcGVydGllcy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RlbGVtZXRyeS90ZXN0L25vZGUvY29tbW9uUHJvcGVydGllcy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQztBQUN2QyxPQUFPLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUM3RixPQUFPLEVBQWdCLHNCQUFzQixFQUFpQixNQUFNLG1EQUFtRCxDQUFDO0FBQ3hILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFFN0QsS0FBSyxDQUFDLCtCQUErQixFQUFFO0lBQ3RDLElBQUksa0JBQTBDLENBQUM7SUFFL0MsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLGtCQUFrQixDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysa0JBQWtCLEdBQUcsSUFBSSxzQkFBc0IsRUFBRSxDQUFDO0lBQ25ELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFNBQVMsRUFBRTtRQUNmLE1BQU0sS0FBSyxHQUFHLGdDQUFnQyxDQUFDLGtCQUFrQixFQUFFLFNBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLGlCQUFpQixF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