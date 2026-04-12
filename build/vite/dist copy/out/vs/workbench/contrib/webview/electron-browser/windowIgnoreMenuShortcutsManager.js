/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isMacintosh } from '../../../../base/common/platform.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { hasNativeTitlebar } from '../../../../platform/window/common/window.js';
export class WindowIgnoreMenuShortcutsManager {
    constructor(configurationService, mainProcessService, _nativeHostService) {
        this._nativeHostService = _nativeHostService;
        this._isUsingNativeTitleBars = hasNativeTitlebar(configurationService);
        this._webviewMainService = ProxyChannel.toService(mainProcessService.getChannel('webview'));
    }
    didFocus() {
        this.setIgnoreMenuShortcuts(true);
    }
    didBlur() {
        this.setIgnoreMenuShortcuts(false);
    }
    get _shouldToggleMenuShortcutsEnablement() {
        return isMacintosh || this._isUsingNativeTitleBars;
    }
    setIgnoreMenuShortcuts(value) {
        if (this._shouldToggleMenuShortcutsEnablement) {
            this._webviewMainService.setIgnoreMenuShortcuts({ windowId: this._nativeHostService.windowId }, value);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93SWdub3JlTWVudVNob3J0Y3V0c01hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2VsZWN0cm9uLWJyb3dzZXIvd2luZG93SWdub3JlTWVudVNob3J0Y3V0c01hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUt4RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUVqRixNQUFNLE9BQU8sZ0NBQWdDO0lBTTVDLFlBQ0Msb0JBQTJDLEVBQzNDLGtCQUF1QyxFQUN0QixrQkFBc0M7UUFBdEMsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUV2RCxJQUFJLENBQUMsdUJBQXVCLEdBQUcsaUJBQWlCLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUV2RSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsWUFBWSxDQUFDLFNBQVMsQ0FBeUIsa0JBQWtCLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDckgsQ0FBQztJQUVNLFFBQVE7UUFDZCxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVNLE9BQU87UUFDYixJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVELElBQVksb0NBQW9DO1FBQy9DLE9BQU8sV0FBVyxJQUFJLElBQUksQ0FBQyx1QkFBdUIsQ0FBQztJQUNwRCxDQUFDO0lBRVMsc0JBQXNCLENBQUMsS0FBYztRQUM5QyxJQUFJLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEcsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9