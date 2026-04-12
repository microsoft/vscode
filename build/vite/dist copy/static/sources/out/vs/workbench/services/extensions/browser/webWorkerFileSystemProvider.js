/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { FileType, FileSystemProviderErrorCode, createFileSystemProviderError } from '../../../../platform/files/common/files.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { NotSupportedError } from '../../../../base/common/errors.js';
export class FetchFileSystemProvider {
    constructor() {
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */ + 2 /* FileSystemProviderCapabilities.FileReadWrite */ + 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
    }
    // working implementations
    async readFile(resource) {
        try {
            const res = await fetch(resource.toString(true));
            if (res.status === 200) {
                return new Uint8Array(await res.arrayBuffer());
            }
            throw createFileSystemProviderError(res.statusText, FileSystemProviderErrorCode.Unknown);
        }
        catch (err) {
            throw createFileSystemProviderError(err, FileSystemProviderErrorCode.Unknown);
        }
    }
    // fake implementations
    async stat(_resource) {
        return {
            type: FileType.File,
            size: 0,
            mtime: 0,
            ctime: 0
        };
    }
    watch() {
        return Disposable.None;
    }
    // error implementations
    writeFile(_resource, _content, _opts) {
        throw new NotSupportedError();
    }
    readdir(_resource) {
        throw new NotSupportedError();
    }
    mkdir(_resource) {
        throw new NotSupportedError();
    }
    delete(_resource, _opts) {
        throw new NotSupportedError();
    }
    rename(_from, _to, _opts) {
        throw new NotSupportedError();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViV29ya2VyRmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvYnJvd3Nlci93ZWJXb3JrZXJGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUF5QyxRQUFRLEVBQWdFLDJCQUEyQixFQUFrRCw2QkFBNkIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3ZSLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQWUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFL0UsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFdEUsTUFBTSxPQUFPLHVCQUF1QjtJQUFwQztRQUVVLGlCQUFZLEdBQUcseUdBQXNGLDhEQUFtRCxDQUFDO1FBQ3pKLDRCQUF1QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDckMsb0JBQWUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO0lBNkN2QyxDQUFDO0lBM0NBLDBCQUEwQjtJQUMxQixLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWE7UUFDM0IsSUFBSSxDQUFDO1lBQ0osTUFBTSxHQUFHLEdBQUcsTUFBTSxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2pELElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxHQUFHLEVBQUUsQ0FBQztnQkFDeEIsT0FBTyxJQUFJLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ2hELENBQUM7WUFDRCxNQUFNLDZCQUE2QixDQUFDLEdBQUcsQ0FBQyxVQUFVLEVBQUUsMkJBQTJCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUYsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCxNQUFNLDZCQUE2QixDQUFDLEdBQUcsRUFBRSwyQkFBMkIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvRSxDQUFDO0lBQ0YsQ0FBQztJQUVELHVCQUF1QjtJQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDLFNBQWM7UUFDeEIsT0FBTztZQUNOLElBQUksRUFBRSxRQUFRLENBQUMsSUFBSTtZQUNuQixJQUFJLEVBQUUsQ0FBQztZQUNQLEtBQUssRUFBRSxDQUFDO1lBQ1IsS0FBSyxFQUFFLENBQUM7U0FDUixDQUFDO0lBQ0gsQ0FBQztJQUVELEtBQUs7UUFDSixPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztJQUVELHdCQUF3QjtJQUN4QixTQUFTLENBQUMsU0FBYyxFQUFFLFFBQW9CLEVBQUUsS0FBd0I7UUFDdkUsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDL0IsQ0FBQztJQUNELE9BQU8sQ0FBQyxTQUFjO1FBQ3JCLE1BQU0sSUFBSSxpQkFBaUIsRUFBRSxDQUFDO0lBQy9CLENBQUM7SUFDRCxLQUFLLENBQUMsU0FBYztRQUNuQixNQUFNLElBQUksaUJBQWlCLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBQ0QsTUFBTSxDQUFDLFNBQWMsRUFBRSxLQUF5QjtRQUMvQyxNQUFNLElBQUksaUJBQWlCLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBQ0QsTUFBTSxDQUFDLEtBQVUsRUFBRSxHQUFRLEVBQUUsS0FBNEI7UUFDeEQsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDL0IsQ0FBQztDQUNEIn0=