/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MainContext } from './extHost.protocol.js';
import { Disposable } from './extHostTypes.js';
export class ExtHostChatOutputRenderer {
    constructor(mainContext, webviews) {
        this.webviews = webviews;
        this._renderers = new Map();
        this._proxy = mainContext.getProxy(MainContext.MainThreadChatOutputRenderer);
    }
    registerChatOutputRenderer(extension, viewType, renderer) {
        if (this._renderers.has(viewType)) {
            throw new Error(`Chat output renderer already registered for: ${viewType}`);
        }
        this._renderers.set(viewType, { extension, renderer });
        this._proxy.$registerChatOutputRenderer(viewType, extension.identifier, extension.extensionLocation);
        return new Disposable(() => {
            this._renderers.delete(viewType);
            this._proxy.$unregisterChatOutputRenderer(viewType);
        });
    }
    async $renderChatOutput(viewType, mime, valueData, webviewHandle, token) {
        const entry = this._renderers.get(viewType);
        if (!entry) {
            throw new Error(`No chat output renderer registered for: ${viewType}`);
        }
        const extHostWebview = this.webviews.createNewWebview(webviewHandle, {}, entry.extension);
        const chatOutputWebview = Object.freeze({
            webview: extHostWebview,
            onDidDispose: extHostWebview._onDidDispose,
        });
        return entry.renderer.renderChatOutput(Object.freeze({ mime, value: valueData.buffer }), chatOutputWebview, {}, token);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXRPdXRwdXRSZW5kZXJlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0T3V0cHV0UmVuZGVyZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFnRCxXQUFXLEVBQXFDLE1BQU0sdUJBQXVCLENBQUM7QUFDckksT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBSy9DLE1BQU0sT0FBTyx5QkFBeUI7SUFTckMsWUFDQyxXQUF5QixFQUNSLFFBQXlCO1FBQXpCLGFBQVEsR0FBUixRQUFRLENBQWlCO1FBUDFCLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFHakMsQ0FBQztRQU1KLElBQUksQ0FBQyxNQUFNLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUM5RSxDQUFDO0lBRUQsMEJBQTBCLENBQUMsU0FBZ0MsRUFBRSxRQUFnQixFQUFFLFFBQW1DO1FBQ2pILElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNuQyxNQUFNLElBQUksS0FBSyxDQUFDLGdEQUFnRCxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzdFLENBQUM7UUFFRCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsVUFBVSxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRXJHLE9BQU8sSUFBSSxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQzFCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2pDLElBQUksQ0FBQyxNQUFNLENBQUMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDckQsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRUQsS0FBSyxDQUFDLGlCQUFpQixDQUFDLFFBQWdCLEVBQUUsSUFBWSxFQUFFLFNBQW1CLEVBQUUsYUFBcUIsRUFBRSxLQUF3QjtRQUMzSCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixNQUFNLElBQUksS0FBSyxDQUFDLDJDQUEyQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFFRCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzFGLE1BQU0saUJBQWlCLEdBQTZCLE1BQU0sQ0FBQyxNQUFNLENBQUM7WUFDakUsT0FBTyxFQUFFLGNBQWM7WUFDdkIsWUFBWSxFQUFFLGNBQWMsQ0FBQyxhQUFhO1NBQzFDLENBQUMsQ0FBQztRQUNILE9BQU8sS0FBSyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDeEgsQ0FBQztDQUNEIn0=