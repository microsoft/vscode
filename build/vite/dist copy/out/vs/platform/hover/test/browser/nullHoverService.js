/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
export const NullHoverService = {
    _serviceBrand: undefined,
    hideHover: () => undefined,
    showInstantHover: () => undefined,
    showDelayedHover: () => undefined,
    setupDelayedHover: () => Disposable.None,
    setupDelayedHoverAtMouse: () => Disposable.None,
    setupManagedHover: () => ({
        dispose: () => { },
        show: (focus) => { },
        hide: () => { },
        update: (tooltip, options) => { }
    }),
    showAndFocusLastHover: () => undefined,
    showManagedHover: () => undefined
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbEhvdmVyU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2hvdmVyL3Rlc3QvYnJvd3Nlci9udWxsSG92ZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUdsRSxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBa0I7SUFDOUMsYUFBYSxFQUFFLFNBQVM7SUFDeEIsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7SUFDMUIsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztJQUNqQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO0lBQ2pDLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJO0lBQ3hDLHdCQUF3QixFQUFFLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJO0lBQy9DLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekIsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDbEIsSUFBSSxFQUFFLENBQUMsS0FBZSxFQUFFLEVBQUUsR0FBRyxDQUFDO1FBQzlCLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ2YsTUFBTSxFQUFFLENBQUMsT0FBNkIsRUFBRSxPQUE4QixFQUFFLEVBQUUsR0FBRyxDQUFDO0tBQzlFLENBQUM7SUFDRixxQkFBcUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO0lBQ3RDLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7Q0FDakMsQ0FBQyJ9