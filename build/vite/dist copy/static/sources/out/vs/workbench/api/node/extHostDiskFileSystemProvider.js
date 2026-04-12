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
import { IExtHostConsumerFileSystem } from '../common/extHostFileSystemConsumer.js';
import { Schemas } from '../../../base/common/network.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { DiskFileSystemProvider } from '../../../platform/files/node/diskFileSystemProvider.js';
import { FilePermission } from '../../../platform/files/common/files.js';
import { isLinux } from '../../../base/common/platform.js';
let ExtHostDiskFileSystemProvider = class ExtHostDiskFileSystemProvider {
    constructor(extHostConsumerFileSystem, logService) {
        // Register disk file system provider so that certain
        // file operations can execute fast within the extension
        // host without roundtripping.
        extHostConsumerFileSystem.addFileSystemProvider(Schemas.file, new DiskFileSystemProviderAdapter(logService), { isCaseSensitive: isLinux });
    }
};
ExtHostDiskFileSystemProvider = __decorate([
    __param(0, IExtHostConsumerFileSystem),
    __param(1, ILogService)
], ExtHostDiskFileSystemProvider);
export { ExtHostDiskFileSystemProvider };
class DiskFileSystemProviderAdapter {
    constructor(logService) {
        this.impl = new DiskFileSystemProvider(logService);
    }
    async stat(uri) {
        const stat = await this.impl.stat(uri);
        return {
            type: stat.type,
            ctime: stat.ctime,
            mtime: stat.mtime,
            size: stat.size,
            permissions: stat.permissions === FilePermission.Readonly ? 1 : undefined
        };
    }
    readDirectory(uri) {
        return this.impl.readdir(uri);
    }
    createDirectory(uri) {
        return this.impl.mkdir(uri);
    }
    readFile(uri) {
        return this.impl.readFile(uri);
    }
    writeFile(uri, content, options) {
        return this.impl.writeFile(uri, content, { ...options, unlock: false, atomic: false });
    }
    delete(uri, options) {
        return this.impl.delete(uri, { ...options, useTrash: false, atomic: false });
    }
    rename(oldUri, newUri, options) {
        return this.impl.rename(oldUri, newUri, options);
    }
    copy(source, destination, options) {
        return this.impl.copy(source, destination, options);
    }
    // --- Not Implemented ---
    get onDidChangeFile() { throw new Error('Method not implemented.'); }
    watch(uri, options) { throw new Error('Method not implemented.'); }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdERpc2tGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDekUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXBELElBQU0sNkJBQTZCLEdBQW5DLE1BQU0sNkJBQTZCO0lBRXpDLFlBQzZCLHlCQUFxRCxFQUNwRSxVQUF1QjtRQUdwQyxxREFBcUQ7UUFDckQsd0RBQXdEO1FBQ3hELDhCQUE4QjtRQUM5Qix5QkFBeUIsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksNkJBQTZCLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLENBQUMsQ0FBQztJQUM1SSxDQUFDO0NBQ0QsQ0FBQTtBQVpZLDZCQUE2QjtJQUd2QyxXQUFBLDBCQUEwQixDQUFBO0lBQzFCLFdBQUEsV0FBVyxDQUFBO0dBSkQsNkJBQTZCLENBWXpDOztBQUVELE1BQU0sNkJBQTZCO0lBSWxDLFlBQVksVUFBdUI7UUFDbEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLHNCQUFzQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQWU7UUFDekIsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUV2QyxPQUFPO1lBQ04sSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1lBQ2YsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ2pCLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSztZQUNqQixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixXQUFXLEVBQUUsSUFBSSxDQUFDLFdBQVcsS0FBSyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7U0FDekUsQ0FBQztJQUNILENBQUM7SUFFRCxhQUFhLENBQUMsR0FBZTtRQUM1QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQy9CLENBQUM7SUFFRCxlQUFlLENBQUMsR0FBZTtRQUM5QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFRCxRQUFRLENBQUMsR0FBZTtRQUN2QixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxTQUFTLENBQUMsR0FBZSxFQUFFLE9BQW1CLEVBQUUsT0FBa0U7UUFDakgsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRyxPQUFPLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztJQUN4RixDQUFDO0lBRUQsTUFBTSxDQUFDLEdBQWUsRUFBRSxPQUF3QztRQUMvRCxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxFQUFFLEdBQUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7SUFDOUUsQ0FBQztJQUVELE1BQU0sQ0FBQyxNQUFrQixFQUFFLE1BQWtCLEVBQUUsT0FBd0M7UUFDdEYsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFRCxJQUFJLENBQUMsTUFBa0IsRUFBRSxXQUF1QixFQUFFLE9BQXdDO1FBQ3pGLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFdBQVcsRUFBRSxPQUFPLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsMEJBQTBCO0lBRTFCLElBQUksZUFBZSxLQUFZLE1BQU0sSUFBSSxLQUFLLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDNUUsS0FBSyxDQUFDLEdBQWUsRUFBRSxPQUE4RSxJQUF1QixNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ3pLIn0=