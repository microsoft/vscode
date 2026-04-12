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
import { VSBuffer, encodeBase64 } from '../../../base/common/buffer.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getMediaOrTextMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { FileOperationError, IFileService } from '../../files/common/files.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME } from '../common/electronRemoteResources.js';
let ElectronRemoteResourceLoader = class ElectronRemoteResourceLoader extends Disposable {
    constructor(windowId, mainProcessService, fileService) {
        super();
        this.windowId = windowId;
        this.fileService = fileService;
        const channel = {
            listen(_, event) {
                throw new Error(`Event not found: ${event}`);
            },
            call: (_, command, arg) => {
                switch (command) {
                    case NODE_REMOTE_RESOURCE_IPC_METHOD_NAME: return this.doRequest(URI.revive(arg[0]));
                }
                throw new Error(`Call not found: ${command}`);
            }
        };
        mainProcessService.registerChannel(NODE_REMOTE_RESOURCE_CHANNEL_NAME, channel);
    }
    async doRequest(uri) {
        let content;
        try {
            const params = new URLSearchParams(uri.query);
            const actual = uri.with({
                scheme: params.get('scheme'),
                authority: params.get('authority'),
                query: '',
            });
            content = await this.fileService.readFile(actual);
        }
        catch (e) {
            const str = encodeBase64(VSBuffer.fromString(e.message));
            if (e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                return { statusCode: 404, body: str };
            }
            else {
                return { statusCode: 500, body: str };
            }
        }
        const mimeType = uri.path && getMediaOrTextMime(uri.path);
        return { statusCode: 200, body: encodeBase64(content.value), mimeType };
    }
    getResourceUriProvider() {
        return (uri) => uri.with({
            scheme: Schemas.vscodeManagedRemoteResource,
            authority: `window:${this.windowId}`,
            query: new URLSearchParams({ authority: uri.authority, scheme: uri.scheme }).toString(),
        });
    }
};
ElectronRemoteResourceLoader = __decorate([
    __param(1, IMainProcessService),
    __param(2, IFileService)
], ElectronRemoteResourceLoader);
export { ElectronRemoteResourceLoader };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb25SZW1vdGVSZXNvdXJjZUxvYWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3JlbW90ZS9lbGVjdHJvbi1icm93c2VyL2VsZWN0cm9uUmVtb3RlUmVzb3VyY2VMb2FkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVsRCxPQUFPLEVBQUUsa0JBQWtCLEVBQXFDLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xILE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxvQ0FBb0MsRUFBOEIsTUFBTSxzQ0FBc0MsQ0FBQztBQUVwSixJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7SUFDM0QsWUFDa0IsUUFBZ0IsRUFDWixrQkFBdUMsRUFDN0IsV0FBeUI7UUFFeEQsS0FBSyxFQUFFLENBQUM7UUFKUyxhQUFRLEdBQVIsUUFBUSxDQUFRO1FBRUYsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFJeEQsTUFBTSxPQUFPLEdBQW1CO1lBQy9CLE1BQU0sQ0FBSSxDQUFVLEVBQUUsS0FBYTtnQkFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUM5QyxDQUFD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