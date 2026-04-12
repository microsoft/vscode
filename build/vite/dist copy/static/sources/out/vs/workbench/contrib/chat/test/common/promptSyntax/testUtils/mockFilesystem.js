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
import { URI } from '../../../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { FileType, IFileService } from '../../../../../../../platform/files/common/files.js';
import { dirname } from '../../../../../../../base/common/resources.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { ResourceMap } from '../../../../../../../base/common/map.js';
/**
 * Test file system provider that extends InMemoryFileSystemProvider with realpath support.
 * Allows tests to define custom realpath mappings to simulate symlinks.
 */
export class TestInMemoryFileSystemProviderWithRealPath extends InMemoryFileSystemProvider {
    constructor() {
        super(...arguments);
        this.realPathMappings = new ResourceMap();
    }
    get capabilities() {
        return super.capabilities | 262144 /* FileSystemProviderCapabilities.FileRealpath */;
    }
    /**
     * Defines a realpath mapping for a URI.
     * When realpath() is called for the given URI, it will return the mapped realPath.
     * Use this to simulate symlinks - multiple URIs can map to the same realPath.
     */
    setRealPath(uri, realPath) {
        this.realPathMappings.set(uri, realPath);
    }
    /**
     * Clears all realpath mappings.
     */
    clearRealPathMappings() {
        this.realPathMappings.clear();
    }
    /**
     * Returns the realpath for the given resource.
     * If a mapping was set via setRealPath(), returns that mapped path.
     * Otherwise returns the original path (simulating a non-symlink file).
     */
    async realpath(resource) {
        const mapped = this.realPathMappings.get(resource);
        if (mapped) {
            return mapped.path;
        }
        // Default: return original path (not a symlink)
        return resource.path;
    }
    /**
     * Override stat to mark files with realPath mappings as symbolic links.
     */
    async stat(resource) {
        const baseStat = await super.stat(resource);
        const isSymlink = this.realPathMappings.has(resource);
        if (isSymlink) {
            return {
                ...baseStat,
                type: baseStat.type | FileType.SymbolicLink
            };
        }
        return baseStat;
    }
    /**
     * Override readdir to mark files with realPath mappings as symbolic links.
     */
    async readdir(resource) {
        const entries = await super.readdir(resource);
        return entries.map(([name, type]) => {
            const childUri = URI.joinPath(resource, name);
            if (this.realPathMappings.has(childUri)) {
                return [name, type | FileType.SymbolicLink];
            }
            return [name, type];
        });
    }
}
/**
 * Creates mock filesystem from provided file entries.
 * @param fileService File service instance
 * @param files Array of file entries with path and contents
 */
export function mockFiles(fileService, files, parentFolder) {
    return new MockFilesystem(files, fileService).mock(parentFolder);
}
/**
 * Utility to recursively creates provided filesystem structure.
 */
let MockFilesystem = class MockFilesystem {
    constructor(input, fileService) {
        this.input = input;
        this.fileService = fileService;
        this.createdFiles = [];
        this.createdFolders = [];
        this.createdRootFolders = [];
    }
    /**
     * Starts the mock process.
     */
    async mock(parentFolder) {
        // Check if input is the new simplified format
        if (this.input.length > 0 && 'path' in this.input[0]) {
            return this.mockFromFileEntries(this.input);
        }
        // Use the old format
        return this.mockFromFolders(this.input, parentFolder);
    }
    /**
     * Mock using the new simplified file entry format.
     */
    async mockFromFileEntries(fileEntries) {
        // Create all files and their parent directories
        for (const fileEntry of fileEntries) {
            const fileUri = URI.file(fileEntry.path);
            // Ensure parent directories exist
            await this.ensureParentDirectories(dirname(fileUri));
            // Create the file
            const contents = fileEntry.contents.join('\n');
            await this.fileService.writeFile(fileUri, VSBuffer.fromString(contents));
            this.createdFiles.push(fileUri);
        }
    }
    /**
     * Mock using the old nested folder format.
     */
    async mockFromFolders(folders, parentFolder) {
        const result = await Promise.all(folders.map((folder) => this.mockFolder(folder, parentFolder)));
        this.createdRootFolders.push(...result);
    }
    async delete() {
        // Delete files created by the new format
        for (const fileUri of this.createdFiles) {
            if (await this.fileService.exists(fileUri)) {
                await this.fileService.del(fileUri, { useTrash: false });
            }
        }
        for (const folderUri of this.createdFolders.reverse()) { // reverse to delete children first
            if (await this.fileService.exists(folderUri)) {
                await this.fileService.del(folderUri, { recursive: true, useTrash: false });
            }
        }
        // Delete root folders created by the old format
        for (const folder of this.createdRootFolders) {
            await this.fileService.del(folder, { recursive: true, useTrash: false });
        }
    }
    /**
     * The internal implementation of the filesystem mocking process for the old format.
     */
    async mockFolder(folder, parentFolder) {
        const folderUri = parentFolder
            ? URI.joinPath(parentFolder, folder.name)
            : URI.file(folder.name);
        if (!(await this.fileService.exists(folderUri))) {
            try {
                await this.fileService.createFolder(folderUri);
            }
            catch (error) {
                throw new Error(`Failed to create folder '${folderUri.fsPath}': ${error}.`);
            }
        }
        const resolvedChildren = [];
        for (const child of folder.children) {
            const childUri = URI.joinPath(folderUri, child.name);
            // create child file
            if ('contents' in child) {
                const contents = (typeof child.contents === 'string')
                    ? child.contents
                    : child.contents.join('\n');
                await this.fileService.writeFile(childUri, VSBuffer.fromString(contents));
                resolvedChildren.push(childUri);
                continue;
            }
            // recursively create child filesystem structure
            resolvedChildren.push(await this.mockFolder(child, folderUri));
        }
        return folderUri;
    }
    /**
     * Ensures that all parent directories of the given file URI exist.
     */
    async ensureParentDirectories(dirUri) {
        if (!await this.fileService.exists(dirUri)) {
            // First ensure the parent directory exists (recursive call)
            if (dirUri.path !== '/') {
                await this.ensureParentDirectories(dirname(dirUri));
            }
            // Then create this directory
            try {
                await this.fileService.createFolder(dirUri);
                this.createdFolders.push(dirUri);
            }
            catch (error) {
                throw new Error(`Failed to create directory '${dirUri.toString()}': ${error}.`);
            }
        }
    }
};
MockFilesystem = __decorate([
    __param(1, IFileService)
], MockFilesystem);
export { MockFilesystem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0ZpbGVzeXN0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL3Byb21wdFN5bnRheC90ZXN0VXRpbHMvbW9ja0ZpbGVzeXN0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzlELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN0RSxPQUFPLEVBQWtDLFFBQVEsRUFBRSxZQUFZLEVBQXdELE1BQU0scURBQXFELENBQUM7QUFDbkwsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ3RILE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUV0RTs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sMENBQTJDLFNBQVEsMEJBQTBCO0lBQTFGOztRQUNrQixxQkFBZ0IsR0FBRyxJQUFJLFdBQVcsRUFBTyxDQUFDO0lBZ0U1RCxDQUFDO0lBOURBLElBQWEsWUFBWTtRQUN4QixPQUFPLEtBQUssQ0FBQyxZQUFZLDJEQUE4QyxDQUFDO0lBQ3pFLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsV0FBVyxDQUFDLEdBQVEsRUFBRSxRQUFhO1FBQ2xDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFRDs7T0FFRztJQUNILHFCQUFxQjtRQUNwQixJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUVEOzs7O09BSUc7SUFDSCxLQUFLLENBQUMsUUFB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