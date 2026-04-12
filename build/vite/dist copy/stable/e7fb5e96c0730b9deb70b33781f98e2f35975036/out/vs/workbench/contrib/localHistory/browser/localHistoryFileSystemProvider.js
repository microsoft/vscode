/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileType, hasReadWriteCapability } from '../../../../platform/files/common/files.js';
import { isEqual } from '../../../../base/common/resources.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
/**
 * A wrapper around a standard file system provider
 * that is entirely readonly.
 */
export class LocalHistoryFileSystemProvider {
    static { this.SCHEMA = 'vscode-local-history'; }
    static toLocalHistoryFileSystem(resource) {
        const serializedLocalHistoryResource = {
            location: resource.location.toString(true),
            associatedResource: resource.associatedResource.toString(true)
        };
        // Try to preserve the associated resource as much as possible
        // and only keep the `query` part dynamic. This enables other
        // components (e.g. other timeline providers) to continue
        // providing timeline entries even when our resource is active.
        return resource.associatedResource.with({
            scheme: LocalHistoryFileSystemProvider.SCHEMA,
            query: JSON.stringify(serializedLocalHistoryResource)
        });
    }
    static fromLocalHistoryFileSystem(resource) {
        const serializedLocalHistoryResource = JSON.parse(resource.query);
        return {
            location: URI.parse(serializedLocalHistoryResource.location),
            associatedResource: URI.parse(serializedLocalHistoryResource.associatedResource)
        };
    }
    static { this.EMPTY_RESOURCE = URI.from({ scheme: LocalHistoryFileSystemProvider.SCHEMA, path: '/empty' }); }
    static { this.EMPTY = {
        location: LocalHistoryFileSystemProvider.EMPTY_RESOURCE,
        associatedResource: LocalHistoryFileSystemProvider.EMPTY_RESOURCE
    }; }
    get capabilities() {
        return 2 /* FileSystemProviderCapabilities.FileReadWrite */ | 2048 /* FileSystemProviderCapabilities.Readonly */;
    }
    constructor(fileService) {
        this.fileService = fileService;
        this.mapSchemeToProvider = new Map();
        //#endregion
        //#region Unsupported File Operations
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
    }
    async withProvider(resource) {
        const scheme = resource.scheme;
        let providerPromise = this.mapSchemeToProvider.get(scheme);
        if (!providerPromise) {
            // Resolve early when provider already exists
            const provider = this.fileService.getProvider(scheme);
            if (provider) {
                providerPromise = Promise.resolve(provider);
            }
            // Otherwise wait for registration
            else {
                providerPromise = new Promise(resolve => {
                    const disposable = this.fileService.onDidChangeFileSystemProviderRegistrations(e => {
                        if (e.added && e.provider && e.scheme === scheme) {
                            disposable.dispose();
                            resolve(e.provider);
                        }
                    });
                });
            }
            this.mapSchemeToProvider.set(scheme, providerPromise);
        }
        return providerPromise;
    }
    //#region Supported File Operations
    async stat(resource) {
        const location = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(resource).location;
        // Special case: empty resource
        if (isEqual(LocalHistoryFileSystemProvider.EMPTY_RESOURCE, location)) {
            return { type: FileType.File, ctime: 0, mtime: 0, size: 0 };
        }
        // Otherwise delegate to provider
        return (await this.withProvider(location)).stat(location);
    }
    async readFile(resource) {
        const location = LocalHistoryFileSystemProvider.fromLocalHistoryFileSystem(resource).location;
        // Special case: empty resource
        if (isEqual(LocalHistoryFileSystemProvider.EMPTY_RESOURCE, location)) {
            return VSBuffer.fromString('').buffer;
        }
        // Otherwise delegate to provider
        const provider = await this.withProvider(location);
        if (hasReadWriteCapability(provider)) {
            return provider.readFile(location);
        }
        throw new Error('Unsupported');
    }
    async writeFile(resource, content, opts) { }
    async mkdir(resource) { }
    async readdir(resource) { return []; }
    async rename(from, to, opts) { }
    async delete(resource, opts) { }
    watch(resource, opts) { return Disposable.None; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbG9jYWxIaXN0b3J5L2Jyb3dzZXIvbG9jYWxIaXN0b3J5RmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBNkUsUUFBUSxFQUFxQixzQkFBc0IsRUFBMkcsTUFBTSw0Q0FBNEMsQ0FBQztBQUNyUyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBb0I3RDs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sOEJBQThCO2FBRTFCLFdBQU0sR0FBRyxzQkFBc0IsQUFBekIsQ0FBMEI7SUFFaEQsTUFBTSxDQUFDLHdCQUF3QixDQUFDLFFBQStCO1FBQzlELE1BQU0sOEJBQThCLEdBQW9DO1lBQ3ZFLFFBQVEsRUFBRSxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDMUMsa0JBQWtCLEVBQUUsUUFBUSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7U0FDOUQsQ0FBQztRQUVGLDhEQUE4RDtRQUM5RCw2REFBNkQ7UUFDN0QseURBQXlEO1FBQ3pELCtEQUErRDtRQUMvRCxPQUFPLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUM7WUFDdkMsTUFBTSxFQUFFLDhCQUE4QixDQUFDLE1BQU07WUFDN0Ms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