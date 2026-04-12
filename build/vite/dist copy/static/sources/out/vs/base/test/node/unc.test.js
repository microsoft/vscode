/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { getUNCHost } from '../../node/unc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
suite('UNC', () => {
    test('getUNCHost', () => {
        strictEqual(getUNCHost(undefined), undefined);
        strictEqual(getUNCHost(null), undefined);
        strictEqual(getUNCHost('/'), undefined);
        strictEqual(getUNCHost('/foo'), undefined);
        strictEqual(getUNCHost('c:'), undefined);
        strictEqual(getUNCHost('c:\\'), undefined);
        strictEqual(getUNCHost('c:\\foo'), undefined);
        strictEqual(getUNCHost('c:\\foo\\\\server\\path'), undefined);
        strictEqual(getUNCHost('\\'), undefined);
        strictEqual(getUNCHost('\\\\'), undefined);
        strictEqual(getUNCHost('\\\\localhost'), undefined);
        strictEqual(getUNCHost('\\\\localhost\\'), 'localhost');
        strictEqual(getUNCHost('\\\\localhost\\a'), 'localhost');
        strictEqual(getUNCHost('\\\\.'), undefined);
        strictEqual(getUNCHost('\\\\?'), undefined);
        strictEqual(getUNCHost('\\\\.\\localhost'), '.');
        strictEqual(getUNCHost('\\\\?\\localhost'), '?');
        strictEqual(getUNCHost('\\\\.\\UNC\\localhost'), '.');
        strictEqual(getUNCHost('\\\\?\\UNC\\localhost'), '?');
        strictEqual(getUNCHost('\\\\.\\UNC\\localhost\\'), 'localhost');
        strictEqual(getUNCHost('\\\\?\\UNC\\localhost\\'), 'localhost');
        strictEqual(getUNCHost('\\\\.\\UNC\\localhost\\a'), 'localhost');
        strictEqual(getUNCHost('\\\\?\\UNC\\localhost\\a'), 'localhost');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5jLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3Qvbm9kZS91bmMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUMvQyxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU3RSxLQUFLLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRTtJQUVqQixJQUFJLENBQUMsWUFBWSxFQUFFLEdBQUcsRUFBRTtRQUV2QixXQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFekMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN4QyxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTNDLFdBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDekMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUMzQyxXQUFXLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzlDLFdBQVcsQ0FBQyxVQUFVLENBQUMseUJBQXlCLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU5RCxXQUFXLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3pDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDM0MsV0FBVyxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUVwRCxXQUFXLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDeEQsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRXpELFdBQVcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU1QyxXQUFXLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDakQsV0FBVyxDQUFDLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRWpELFdBQVcsQ0FBQyxVQUFVLENBQUMsdUJBQXVCLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN0RCxXQUFXLENBQUMsVUFBVSxDQUFDLHVCQUF1QixDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFdEQsV0FBVyxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ2hFLFdBQVcsQ0FBQyxVQUFVLENBQUMseUJBQXlCLENBQUMsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUVoRSxXQUFXLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDakUsV0FBVyxDQUFDLFVBQVUsQ0FBQywwQkFBMEIsQ0FBQyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ2xFLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztBQUMzQyxDQUFDLENBQUMsQ0FBQyJ9