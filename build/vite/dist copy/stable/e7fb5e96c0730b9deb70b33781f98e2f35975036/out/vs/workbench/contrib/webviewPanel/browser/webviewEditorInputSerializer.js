/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { URI } from '../../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { WebviewInput } from './webviewEditorInput.js';
import { IWebviewWorkbenchService } from './webviewWorkbenchService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
let WebviewEditorInputSerializer = class WebviewEditorInputSerializer {
    static { this.ID = WebviewInput.typeId; }
    constructor(_webviewWorkbenchService) {
        this._webviewWorkbenchService = _webviewWorkbenchService;
    }
    canSerialize(input) {
        return this._webviewWorkbenchService.shouldPersist(input);
    }
    serialize(input) {
        if (!this.canSerialize(input)) {
            return undefined;
        }
        const data = this.toJson(input);
        try {
            return JSON.stringify(data);
        }
        catch {
            return undefined;
        }
    }
    deserialize(_instantiationService, serializedEditorInput) {
        const data = this.fromJson(JSON.parse(serializedEditorInput));
        return this._webviewWorkbenchService.openRevivedWebview({
            webviewInitInfo: {
                providedViewType: data.providedId,
                origin: data.origin,
                title: data.title,
                options: data.webviewOptions,
                contentOptions: data.contentOptions,
                extension: data.extension,
            },
            viewType: data.viewType,
            title: data.title,
            iconPath: data.iconPath,
            state: data.state,
            group: data.group
        });
    }
    fromJson(data) {
        return {
            ...data,
            extension: reviveWebviewExtensionDescription(data.extensionId, data.extensionLocation),
            iconPath: reviveWebviewIconPath(data.iconPath),
            state: reviveState(data.state),
            webviewOptions: restoreWebviewOptions(data.options),
            contentOptions: restoreWebviewContentOptions(data.options),
        };
    }
    toJson(input) {
        return {
            origin: input.webview.origin,
            viewType: input.viewType,
            providedId: input.providerId,
            title: input.getName(),
            options: { ...input.webview.options, ...input.webview.contentOptions },
            extensionLocation: input.extension?.location,
            extensionId: input.extension?.id.value,
            state: input.webview.state,
            iconPath: input.iconPath
                ? ThemeIcon.isThemeIcon(input.iconPath)
                    ? input.iconPath
                    : { light: input.iconPath.light, dark: input.iconPath.dark, }
                : undefined,
            group: input.group
        };
    }
};
WebviewEditorInputSerializer = __decorate([
    __param(0, IWebviewWorkbenchService)
], WebviewEditorInputSerializer);
export { WebviewEditorInputSerializer };
export function reviveWebviewExtensionDescription(extensionId, extensionLocation) {
    if (!extensionId) {
        return undefined;
    }
    const location = reviveUri(extensionLocation);
    if (!location) {
        return undefined;
    }
    return {
        id: new ExtensionIdentifier(extensionId),
        location,
    };
}
export function reviveWebviewIconPath(data) {
    if (!data) {
        return undefined;
    }
    if (ThemeIcon.isThemeIcon(data)) {
        return data;
    }
    const light = reviveUri(data.light);
    const dark = reviveUri(data.dark);
    return light && dark ? { light, dark } : undefined;
}
function reviveUri(data) {
    if (!data) {
        return undefined;
    }
    try {
        if (typeof data === 'string') {
            return URI.parse(data);
        }
        return URI.from(data);
    }
    catch {
        return undefined;
    }
}
function reviveState(state) {
    return typeof state === 'string' ? state : undefined;
}
export function restoreWebviewOptions(options) {
    return options;
}
export function restoreWebviewContentOptions(options) {
    return {
        ...options,
        localResourceRoots: options.localResourceRoots?.map(uri => reviveUri(uri)),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld0VkaXRvcklucHV0U2VyaWFsaXplci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXdQYW5lbC9icm93c2VyL3dlYnZpZXdFZGl0b3JJbnB1dFNlcmlhbGl6ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUkzRixPQUFPLEVBQW1CLFlBQVksRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQW1DMUQsSUFBTSw0QkFBNEIsR0FBbEMsTUFBTSw0QkFBNEI7YUFFakIsT0FBRSxHQUFHLFlBQVksQ0FBQyxNQUFNLEFBQXRCLENBQXVCO0lBRWhELFlBQzRDLHdCQUFrRDtRQUFsRCw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO0lBQzFGLENBQUM7SUFFRSxZQUFZLENBQUMsS0FBbUI7UUFDdEMsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTSxTQUFTLENBQUMsS0FBbUI7UUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUMvQixPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUM7WUFDSixPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDN0IsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNSLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7SUFDRixDQUFDO0lBRU0sV0FBVyxDQUNqQixxQkFBNEMsRUFDNUMscUJBQTZCO1FBRTdCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7UUFDOUQsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsa0JBQWtCLENBQUM7WUFDdkQsZUFBZSxFQUFFO2dCQUNoQixnQkFBZ0IsRUFBRSxJQUFJLENBQUMsVUFBVTtnQkFDakMsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNO2dCQUNuQixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7Z0JBQ2pCLE9BQU8sRUFBRSxJQUFJLENBQUMsY0FBYztnQkFDNUIsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjO2dCQUNuQyxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7YUFDekI7WUFDRCxRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDdkIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLFFBQVEsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUN2QixLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDakIsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1NBQ2pCLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFUyxRQUFRLENBQUMsSUFBdUI7UUFDekMsT0FBTztZQUNOLEdBQUcsSUFBSTtZQUNQLFNBQVMsRUFBRSxpQ0FBaUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztZQUN0RixRQUFRLEVBQUUscUJBQXFCLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztZQUM5QyxLQUFLLEVBQUUsV0FBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDOUIsY0FBYyxFQUFFLHFCQUFxQixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7WUFDbkQsY0FBYyxFQUFFLDRCQUE0QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7U0FDMUQsQ0FBQztJQUNILENBQUM7SUFFUyxNQUFNLENBQUMsS0FBbUI7UUFDbkMsT0FBTztZQUNOLE1BQU0sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDNUIsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO1lBQ3hCLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtZQUM1QixLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRTtZQUN0QixPQUFPLEVBQUUsRUFBRSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxjQUFjLEVBQUU7WUFDdEUsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLFNBQVMsRUFBRSxRQUFRO1lBQzVDLFdBQVcsRUFBRSxLQUFLLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxLQUFLO1lBQ3RDLEtBQUssRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUs7WUFDMUIsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO2dCQUN2QixDQUFDLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDO29CQUN0QyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVE7b0JBQ2hCLENBQUMsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUc7Z0JBQzlELENBQUMsQ0FBQyxTQUFTO1lBQ1osS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLO1NBQ2xCLENBQUM7SUFDSCxDQUFDOztBQTNFVyw0QkFBNEI7SUFLdEMsV0FBQSx3QkFBd0IsQ0FBQTtHQUxkLDRCQUE0QixDQTRFeEM7O0FBRUQsTUFBTSxVQUFVLGlDQUFpQyxDQUNoRCxXQUErQixFQUMvQixpQkFBNEM7SUFFNUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ2xCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM5QyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsT0FBTztRQUNOLEVBQUUsRUFBRSxJQUFJLG1CQUFtQixDQUFDLFdBQVcsQ0FBQztRQUN4QyxRQUFRO0tBQ1IsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLFVBQVUscUJBQXFCLENBQUMsSUFBb0M7SUFDekUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ1gsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksU0FBUyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ2pDLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELE1BQU0sS0FBSyxHQUFHLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDcEMsTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQyxPQUFPLEtBQUssSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7QUFDcEQsQ0FBQztBQUlELFNBQVMsU0FBUyxDQUFDLElBQXdDO0lBQzFELElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNYLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxJQUFJLENBQUM7UUFDSixJQUFJLE9BQU8sSUFBSSxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQzlCLE9BQU8sR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN4QixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsV0FBVyxDQUFDLEtBQTBCO0lBQzlDLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUN0RCxDQUFDO0FBRUQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLE9BQWlDO0lBQ3RFLE9BQU8sT0FBTyxDQUFDO0FBQ2hCLENBQUM7QUFFRCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsT0FBaUM7SUFDN0UsT0FBTztRQUNOLEdBQUcsT0FBTztRQUNWLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7S0FDMUUsQ0FBQztBQUNILENBQUMifQ==