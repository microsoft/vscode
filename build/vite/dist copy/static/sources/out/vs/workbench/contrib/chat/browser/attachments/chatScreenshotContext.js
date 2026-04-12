/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export const ScreenshotVariableId = 'screenshot-focused-window';
export function convertBufferToScreenshotVariable(buffer) {
    return {
        id: ScreenshotVariableId,
        name: localize('screenshot', 'Screenshot'),
        value: buffer.buffer,
        kind: 'image'
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFNjcmVlbnNob3RDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRTY3JlZW5zaG90Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFHakQsTUFBTSxDQUFDLE1BQU0sb0JBQW9CLEdBQUcsMkJBQTJCLENBQUM7QUFFaEUsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLE1BQWdCO0lBQ2pFLE9BQU87UUFDTixFQUFFLEVBQUUsb0JBQW9CO1FBQ3hCLElBQUksRUFBRSxRQUFRLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQztRQUMxQyxLQUFLLEVBQUUsTUFBTSxDQUFDLE1BQU07UUFDcEIsSUFBSSxFQUFFLE9BQU87S0FDYixDQUFDO0FBQ0gsQ0FBQyJ9