/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../common/lifecycle.js';
let baseHoverDelegate = {
    showInstantHover: () => undefined,
    showDelayedHover: () => undefined,
    setupDelayedHover: () => Disposable.None,
    setupDelayedHoverAtMouse: () => Disposable.None,
    hideHover: () => undefined,
    showAndFocusLastHover: () => undefined,
    setupManagedHover: () => ({
        dispose: () => undefined,
        show: () => undefined,
        hide: () => undefined,
        update: () => undefined,
    }),
    showManagedHover: () => undefined
};
/**
 * Sets the hover delegate for use **only in the `base/` layer**.
 */
export function setBaseLayerHoverDelegate(hoverDelegate) {
    baseHoverDelegate = hoverDelegate;
}
/**
 * Gets the hover delegate for use **only in the `base/` layer**.
 *
 * Since the hover service depends on various platform services, this delegate essentially bypasses
 * the standard dependency injection mechanism by injecting a global hover service at start up. The
 * only reason this should be used is if `IHoverService` is not available.
 */
export function getBaseLayerHoverDelegate() {
    return baseHoverDelegate;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG92ZXJEZWxlZ2F0ZTIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZTIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRzFELElBQUksaUJBQWlCLEdBQW9CO0lBQ3hDLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7SUFDakMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztJQUNqQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSTtJQUN4Qyx3QkFBd0IsRUFBRSxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSTtJQUMvQyxTQUFTLEVBQUUsR0FBRyxFQUFFLENBQUMsU0FBUztJQUMxQixxQkFBcUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxTQUFTO0lBQ3RDLGlCQUFpQixFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDekIsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7UUFDeEIsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7UUFDckIsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7UUFDckIsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7S0FDdkIsQ0FBQztJQUNGLGdCQUFnQixFQUFFLEdBQUcsRUFBRSxDQUFDLFNBQVM7Q0FDakMsQ0FBQztBQUVGOztHQUVHO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QixDQUFDLGFBQThCO0lBQ3ZFLGlCQUFpQixHQUFHLGFBQWEsQ0FBQztBQUNuQyxDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLHlCQUF5QjtJQUN4QyxPQUFPLGlCQUFpQixDQUFDO0FBQzFCLENBQUMifQ==