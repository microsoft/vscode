/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Barrier } from '../../../base/common/async.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
export class McpGalleryManifestIPCService extends Disposable {
    get mcpGalleryManifestStatus() {
        return this._mcpGalleryManifest ? "available" /* McpGalleryManifestStatus.Available */ : "unavailable" /* McpGalleryManifestStatus.Unavailable */;
    }
    constructor(server) {
        super();
        this._onDidChangeMcpGalleryManifest = this._register(new Emitter());
        this.onDidChangeMcpGalleryManifest = this._onDidChangeMcpGalleryManifest.event;
        this._onDidChangeMcpGalleryManifestStatus = this._register(new Emitter());
        this.onDidChangeMcpGalleryManifestStatus = this._onDidChangeMcpGalleryManifestStatus.event;
        this.barrier = new Barrier();
        server.registerChannel('mcpGalleryManifest', {
            listen: () => Event.None,
            call: async (context, command, args) => {
                switch (command) {
                    case 'setMcpGalleryManifest': {
                        const manifest = Array.isArray(args) ? args[0] : null;
                        return Promise.resolve(this.setMcpGalleryManifest(manifest));
                    }
                }
                throw new Error('Invalid call');
            }
        });
    }
    async getMcpGalleryManifest() {
        await this.barrier.wait();
        return this._mcpGalleryManifest ?? null;
    }
    setMcpGalleryManifest(manifest) {
        this._mcpGalleryManifest = manifest;
        this._onDidChangeMcpGalleryManifest.fire(manifest);
        this._onDidChangeMcpGalleryManifestStatus.fire(this.mcpGalleryManifestStatus);
        this.barrier.open();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZUlwYy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZUlwYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJL0QsTUFBTSxPQUFPLDRCQUE2QixTQUFRLFVBQVU7SUFhM0QsSUFBSSx3QkFBd0I7UUFDM0IsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxzREFBb0MsQ0FBQyx5REFBcUMsQ0FBQztJQUM3RyxDQUFDO0lBRUQsWUFBWSxNQUErQjtRQUMxQyxLQUFLLEVBQUUsQ0FBQztRQWRELG1DQUE4QixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQThCLENBQUMsQ0FBQztRQUMxRixrQ0FBNkIsR0FBRyxJQUFJLENBQUMsOEJBQThCLENBQUMsS0FBSyxDQUFDO1FBRTNFLHlDQUFvQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQTRCLENBQUMsQ0FBQztRQUM5Rix3Q0FBbUMsR0FBRyxJQUFJLENBQUMsb0NBQW9DLENBQUMsS0FBSyxDQUFDO1FBRzlFLFlBQU8sR0FBRyxJQUFJLE9BQU8sRUFBRSxDQUFDO1FBUXhDLE1BQU0sQ0FBQyxlQUFlLENBQUMsb0JBQW9CLEVBQUU7WUFDNUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJO1lBQ3hCLElBQUksRUFBRSxLQUFLLEVBQUssT0FBZ0IsRUFBRSxPQUFlLEVBQUUsSUFBYyxFQUFjLEVBQUU7Z0JBQ2hGLFFBQVEsT0FBTyxFQUFFLENBQUM7b0JBQ2pCLEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO3dCQUM5QixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUErQixDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7d0JBQ3BGLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFDLENBQU0sQ0FBQztvQkFDbkUsQ0FBQztnQkFDRixDQUFDO2dCQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDakMsQ0FBQztTQUNELENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRCxLQUFLLENBQUMscUJBQXFCO1FBQzFCLE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxQixPQUFPLElBQUksQ0FBQyxtQkFBbUIsSUFBSSxJQUFJLENBQUM7SUFDekMsQ0FBQztJQUVPLHFCQUFxQixDQUFDLFFBQW9DO1FBQ2pFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxRQUFRLENBQUM7UUFDcEMsSUFBSSxDQUFDLDhCQUE4QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsb0NBQW9DLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDckIsQ0FBQztDQUVEIn0=