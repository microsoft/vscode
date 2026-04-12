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
import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IProductService } from '../../product/common/productService.js';
import { ExtensionGalleryManifestService } from './extensionGalleryManifestService.js';
let ExtensionGalleryManifestIPCService = class ExtensionGalleryManifestIPCService extends ExtensionGalleryManifestService {
    get extensionGalleryManifestStatus() {
        return this._extensionGalleryManifest ? "available" /* ExtensionGalleryManifestStatus.Available */ : "unavailable" /* ExtensionGalleryManifestStatus.Unavailable */;
    }
    constructor(server, productService) {
        super(productService);
        this._onDidChangeExtensionGalleryManifest = this._register(new Emitter());
        this.onDidChangeExtensionGalleryManifest = this._onDidChangeExtensionGalleryManifest.event;
        this._onDidChangeExtensionGalleryManifestStatus = this._register(new Emitter());
        this.onDidChangeExtensionGalleryManifestStatus = this._onDidChangeExtensionGalleryManifestStatus.event;
        this.barrier = new Barrier();
        server.registerChannel('extensionGalleryManifest', {
            listen: () => Event.None,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            call: async (context, command, args) => {
                switch (command) {
                    case 'setExtensionGalleryManifest': return Promise.resolve(this.setExtensionGalleryManifest(args[0]));
                }
                throw new Error('Invalid call');
            }
        });
    }
    async getExtensionGalleryManifest() {
        await this.barrier.wait();
        return this._extensionGalleryManifest ?? null;
    }
    setExtensionGalleryManifest(manifest) {
        this._extensionGalleryManifest = manifest;
        this._onDidChangeExtensionGalleryManifest.fire(manifest);
        this._onDidChangeExtensionGalleryManifestStatus.fire(this.extensionGalleryManifestStatus);
        this.barrier.open();
    }
};
ExtensionGalleryManifestIPCService = __decorate([
    __param(1, IProductService)
], ExtensionGalleryManifestIPCService);
export { ExtensionGalleryManifestIPCService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZUlwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2VJcGMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRXpFLE9BQU8sRUFBRSwrQkFBK0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRWhGLElBQU0sa0NBQWtDLEdBQXhDLE1BQU0sa0NBQW1DLFNBQVEsK0JBQStCO0lBYXRGLElBQWEsOEJBQThCO1FBQzFDLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixDQUFDLENBQUMsNERBQTBDLENBQUMsK0RBQTJDLENBQUM7SUFDL0gsQ0FBQztJQUVELFlBQ0MsTUFBK0IsRUFDZCxjQUErQjtRQUVoRCxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7UUFqQmYseUNBQW9DLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBb0MsQ0FBQyxDQUFDO1FBQzdGLHdDQUFtQyxHQUFHLElBQUksQ0FBQyxvQ0FBb0MsQ0FBQyxLQUFLLENBQUM7UUFFaEcsK0NBQTBDLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBa0MsQ0FBQyxDQUFDO1FBQ2pHLDhDQUF5QyxHQUFHLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxLQUFLLENBQUM7UUFHbkcsWUFBTyxHQUFHLElBQUksT0FBTyxFQUFFLENBQUM7UUFXeEMsTUFBTSxDQUFDLGVBQWUsQ0FBQywwQkFBMEIsRUFBRTtZQUNsRCxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLElBQUk7WUFDeEIsOERBQThEO1lBQzlELElBQUksRUFBRSxLQUFLLEVBQUUsT0FBWSxFQUFFLE9BQWUsRUFBRSxJQUFVLEVBQWdCLEVBQUU7Z0JBQ3ZFLFFBQVEsT0FBTyxFQUFFLENBQUM7b0JBQ2pCLEtBQUssNkJBQTZCLENBQUMsQ0FBQyxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZHLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUNqQyxDQUFDO1NBQ0QsQ0FBQyxDQUFDO0lBQ0osQ0FBQztJQUVRLEtBQUssQ0FBQywyQkFBMkI7UUFDekMsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQzFCLE9BQU8sSUFBSSxDQUFDLHlCQUF5QixJQUFJLElBQUksQ0FBQztJQUMvQyxDQUFDO0lBRU8sMkJBQTJCLENBQUMsUUFBMEM7UUFDN0UsSUFBSSxDQUFDLHlCQUF5QixHQUFHLFFBQVEsQ0FBQztRQUMxQyxJQUFJLENBQUMsb0NBQW9DLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLENBQUM7UUFDMUYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNyQixDQUFDO0NBRUQsQ0FBQTtBQTlDWSxrQ0FBa0M7SUFtQjVDLFdBQUEsZUFBZSxDQUFBO0dBbkJMLGtDQUFrQyxDQThDOUMifQ==