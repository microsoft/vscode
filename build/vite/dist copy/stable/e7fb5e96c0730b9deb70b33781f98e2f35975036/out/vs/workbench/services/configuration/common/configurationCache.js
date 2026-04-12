/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { joinPath } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Queue } from '../../../../base/common/async.js';
export class ConfigurationCache {
    constructor(donotCacheResourcesWithSchemes, environmentService, fileService) {
        this.donotCacheResourcesWithSchemes = donotCacheResourcesWithSchemes;
        this.fileService = fileService;
        this.cachedConfigurations = new Map();
        this.cacheHome = environmentService.cacheHome;
    }
    needsCaching(resource) {
        // Cache all non native resources
        return !this.donotCacheResourcesWithSchemes.includes(resource.scheme);
    }
    read(key) {
        return this.getCachedConfiguration(key).read();
    }
    write(key, content) {
        return this.getCachedConfiguration(key).save(content);
    }
    remove(key) {
        return this.getCachedConfiguration(key).remove();
    }
    getCachedConfiguration({ type, key }) {
        const k = `${type}:${key}`;
        let cachedConfiguration = this.cachedConfigurations.get(k);
        if (!cachedConfiguration) {
            cachedConfiguration = new CachedConfiguration({ type, key }, this.cacheHome, this.fileService);
            this.cachedConfigurations.set(k, cachedConfiguration);
        }
        return cachedConfiguration;
    }
}
class CachedConfiguration {
    constructor({ type, key }, cacheHome, fileService) {
        this.fileService = fileService;
        this.cachedConfigurationFolderResource = joinPath(cacheHome, 'CachedConfigurations', type, key);
        this.cachedConfigurationFileResource = joinPath(this.cachedConfigurationFolderResource, type === 'workspaces' ? 'workspace.json' : 'configuration.json');
        this.queue = new Queue();
    }
    async read() {
        try {
            const content = await this.fileService.readFile(this.cachedConfigurationFileResource);
            return content.value.toString();
        }
        catch (e) {
            return '';
        }
    }
    async save(content) {
        const created = await this.createCachedFolder();
        if (created) {
            await this.queue.queue(async () => {
                await this.fileService.writeFile(this.cachedConfigurationFileResource, VSBuffer.fromString(content));
            });
        }
    }
    async remove() {
        try {
            await this.queue.queue(() => this.fileService.del(this.cachedConfigurationFolderResource, { recursive: true, useTrash: false }));
        }
        catch (error) {
            if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                throw error;
            }
        }
    }
    async createCachedFolder() {
        if (await this.fileService.exists(this.cachedConfigurationFolderResource)) {
            return true;
        }
        try {
            await this.fileService.createFolder(this.cachedConfigurationFolderResource);
            return true;
        }
        catch (error) {
            return false;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbkNhY2hlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25DYWNoZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUd6RCxNQUFNLE9BQU8sa0JBQWtCO0lBSzlCLFlBQ2tCLDhCQUF3QyxFQUN6RCxrQkFBdUMsRUFDdEIsV0FBeUI7UUFGekIsbUNBQThCLEdBQTlCLDhCQUE4QixDQUFVO1FBRXhDLGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBTDFCLHlCQUFvQixHQUFxQyxJQUFJLEdBQUcsRUFBK0IsQ0FBQztRQU9oSCxJQUFJLENBQUMsU0FBUyxHQUFHLGtCQUFrQixDQUFDLFNBQVMsQ0FBQztJQUMvQyxDQUFDO0lBRUQsWUFBWSxDQUFDLFFBQWE7UUFDekIsaUNBQWlDO1FBQ2pDLE9BQU8sQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBRUQsSUFBSSxDQUFDLEdBQXFCO1FBQ3pCLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hELENBQUM7SUFFRCxLQUFLLENBQUMsR0FBcUIsRUFBRSxPQUFlO1FBQzNDLE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBRUQs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