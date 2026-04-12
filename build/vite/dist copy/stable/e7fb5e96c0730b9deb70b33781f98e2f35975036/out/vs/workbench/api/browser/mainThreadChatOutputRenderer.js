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
import { VSBuffer } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IChatOutputRendererService } from '../../contrib/chat/browser/chatOutputItemRenderer.js';
import { ExtHostContext } from '../common/extHost.protocol.js';
let MainThreadChatOutputRenderer = class MainThreadChatOutputRenderer extends Disposable {
    constructor(extHostContext, _mainThreadWebview, _rendererService) {
        super();
        this._mainThreadWebview = _mainThreadWebview;
        this._rendererService = _rendererService;
        this._webviewHandlePool = 0;
        this.registeredRenderers = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatOutputRenderer);
    }
    dispose() {
        super.dispose();
        this.registeredRenderers.forEach(disposable => disposable.dispose());
        this.registeredRenderers.clear();
    }
    $registerChatOutputRenderer(viewType, extensionId, extensionLocation) {
        this._rendererService.registerRenderer(viewType, {
            renderOutputPart: async (mime, data, webview, token) => {
                const webviewHandle = `chat-output-${++this._webviewHandlePool}`;
                this._mainThreadWebview.addWebview(webviewHandle, webview, {
                    serializeBuffersForPostMessage: true,
                });
                return this._proxy.$renderChatOutput(viewType, mime, VSBuffer.wrap(data), webviewHandle, token);
            },
        }, {
            extension: { id: extensionId, location: URI.revive(extensionLocation) }
        });
    }
    $unregisterChatOutputRenderer(viewType) {
        this.registeredRenderers.get(viewType)?.dispose();
    }
};
MainThreadChatOutputRenderer = __decorate([
    __param(2, IChatOutputRendererService)
], MainThreadChatOutputRenderer);
export { MainThreadChatOutputRenderer };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRPdXRwdXRSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdE91dHB1dFJlbmRlcmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sbUNBQW1DLENBQUM7QUFDNUUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVsRyxPQUFPLEVBQWtDLGNBQWMsRUFBcUMsTUFBTSwrQkFBK0IsQ0FBQztBQUczSCxJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFRM0QsWUFDQyxjQUErQixFQUNkLGtCQUFzQyxFQUMzQixnQkFBNkQ7UUFFekYsS0FBSyxFQUFFLENBQUM7UUFIUyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBQ1YscUJBQWdCLEdBQWhCLGdCQUFnQixDQUE0QjtRQVBsRix1QkFBa0IsR0FBRyxDQUFDLENBQUM7UUFFZCx3QkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBc0MsQ0FBQztRQVFwRixJQUFJLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDakYsQ0FBQztJQUVRLE9BQU87UUFDZixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFaEIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBQ3JFLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0lBRUQsMkJBQTJCLENBQUMsUUFBZ0IsRUFBRSxXQUFnQyxFQUFFLGlCQUFnQztRQUMvRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxFQUFFO1lBQ2hELGdCQUFnQixFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRTtnQkFDdEQsTUFBTSxhQUFhLEdBQUcsZUFBZSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO2dCQUVqRSxJQUFJLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUU7b0JBQzFELDhCQUE4QixFQUFFLElBQUk7aUJBQ3BDLENBQUMsQ0FBQztnQkFFSCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLGFBQWEsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNqRyxDQUFDO1NBQ0QsRUFBRTtZQUNGLFNBQVMsRUFBRSxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsRUFBRTtTQUN2RSxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsNkJBQTZCLENBQUMsUUFBZ0I7UUFDN0MsSUFBSSxDQUFDLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQztJQUNuRCxDQUFDO0NBQ0QsQ0FBQTtBQTNDWSw0QkFBNEI7SUFXdEMsV0FBQSwwQkFBMEIsQ0FBQTtHQVhoQiw0QkFBNEIsQ0EyQ3hDIn0=