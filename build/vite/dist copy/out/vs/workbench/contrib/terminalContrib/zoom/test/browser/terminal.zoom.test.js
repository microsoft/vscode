/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { clampTerminalFontSize } from '../../browser/terminal.zoom.contribution.js';
suite('Terminal Mouse Wheel Zoom', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('clamps font size to minimum value when below bounds', () => {
        const result = clampTerminalFontSize(3 + (-2)); // 3 - 2 = 1, clamped to 6
        strictEqual(result, 6, 'Font size should be clamped to minimum value of 6');
    });
    test('clamps font size to maximum value when above bounds', () => {
        const result = clampTerminalFontSize(99 + 5); // 99 + 5 = 104, clamped to 100
        strictEqual(result, 100, 'Font size should be clamped to maximum value of 100');
    });
    test('preserves font size when within bounds', () => {
        const result = clampTerminalFontSize(12 + 3); // 12 + 3 = 15, within bounds
        strictEqual(result, 15, 'Font size should remain unchanged when within bounds');
    });
    test('clamps font size when going below minimum', () => {
        const result = clampTerminalFontSize(6 + (-1)); // 6 - 1 = 5, clamped to 6
        strictEqual(result, 6, 'Font size should be clamped when going below minimum');
    });
    test('clamps font size when going above maximum', () => {
        const result = clampTerminalFontSize(100 + 1); // 100 + 1 = 101, clamped to 100
        strictEqual(result, 100, 'Font size should be clamped when going above maximum');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuem9vbS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3pvb20vdGVzdC9icm93c2VyL3Rlcm1pbmFsLnpvb20udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQ3JDLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRXBGLEtBQUssQ0FBQywyQkFBMkIsRUFBRSxHQUFHLEVBQUU7SUFDdkMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1FBQ2hFLE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtRQUMxRSxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxtREFBbUQsQ0FBQyxDQUFDO0lBQzdFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtRQUNoRSxNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQywrQkFBK0I7UUFDN0UsV0FBVyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUscURBQXFELENBQUMsQ0FBQztJQUNqRixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyx3Q0FBd0MsRUFBRSxHQUFHLEVBQUU7UUFDbkQsTUFBTSxNQUFNLEdBQUcscUJBQXFCLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsNkJBQTZCO1FBQzNFLFdBQVcsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLHNEQUFzRCxDQUFDLENBQUM7SUFDakYsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsR0FBRyxFQUFFO1FBQ3RELE1BQU0sTUFBTSxHQUFHLHFCQUFxQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLDBCQUEwQjtRQUMxRSxXQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxzREFBc0QsQ0FBQyxDQUFDO0lBQ2hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEdBQUcsRUFBRTtRQUN0RCxNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxnQ0FBZ0M7UUFDL0UsV0FBVyxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUUsc0RBQXNELENBQUMsQ0FBQztJQUNsRixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=