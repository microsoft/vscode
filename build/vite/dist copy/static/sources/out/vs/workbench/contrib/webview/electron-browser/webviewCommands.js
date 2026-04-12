/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { getActiveWindow } from '../../../../base/browser/dom.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2 } from '../../../../platform/actions/common/actions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
export class OpenWebviewDeveloperToolsAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.webview.openDeveloperTools',
            title: nls.localize2('openToolsLabel', "Open Webview Developer Tools"),
            category: Categories.Developer,
            metadata: {
                description: nls.localize('openToolsDescription', "Opens Developer Tools for active webviews")
            },
            f1: true
        });
    }
    async run(accessor) {
        const nativeHostService = accessor.get(INativeHostService);
        // eslint-disable-next-line no-restricted-syntax
        const iframeWebviewElements = getActiveWindow().document.querySelectorAll('iframe.webview.ready');
        if (iframeWebviewElements.length) {
            console.info(nls.localize('iframeWebviewAlert', "Using standard dev tools to debug iframe based webview"));
            nativeHostService.openDevTools();
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld0NvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvd2Vidmlldy9lbGVjdHJvbi1icm93c2VyL3dlYnZpZXdDb21tYW5kcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sOERBQThELENBQUM7QUFDMUYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRXpFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWxGLE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxPQUFPO0lBRTNEO1FBQ0MsS0FBSyxDQUFDO1lBQ0wsRUFBRSxFQUFFLDZDQUE2QztZQUNqRCxLQUFLLEVBQUUsR0FBRyxDQUFDLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSw4QkFBOEIsQ0FBQztZQUN0RSxRQUFRLEVBQUUsVUFBVSxDQUFDLFNBQVM7WUFDOUIsUUFBUSxFQUFFO2dCQUNULFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLDJDQUEyQyxDQUFDO2FBQzlGO1lBQ0QsRUFBRSxFQUFFLElBQUk7U0FDUixDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLGlCQUFpQixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztRQUUzRCxnREFBZ0Q7UUFDaEQsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLEVBQUUsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNsRyxJQUFJLHFCQUFxQixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSx3REFBd0QsQ0FBQyxDQUFDLENBQUM7WUFDM0csaUJBQWlCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEMsQ0FBQztJQUNGLENBQUM7Q0FDRCJ9