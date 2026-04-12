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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { FilePermission, FileSystemProviderErrorCode, FileType } from '../../../../platform/files/common/files.js';
import { ChangeType, decodeEditSessionFileContent, EDIT_SESSIONS_SCHEME, IEditSessionsStorageService } from '../common/editSessions.js';
import { NotSupportedError } from '../../../../base/common/errors.js';
let EditSessionsFileSystemProvider = class EditSessionsFileSystemProvider {
    static { this.SCHEMA = EDIT_SESSIONS_SCHEME; }
    constructor(editSessionsStorageService) {
        this.editSessionsStorageService = editSessionsStorageService;
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */ + 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        //#region Unsupported file operations
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
    }
    async readFile(resource) {
        const match = /(?<ref>[^/]+)\/(?<folderName>[^/]+)\/(?<filePath>.*)/.exec(resource.path.substring(1));
        if (!match?.groups) {
            throw FileSystemProviderErrorCode.FileNotFound;
        }
        const { ref, folderName, filePath } = match.groups;
        const data = await this.editSessionsStorageService.read('editSessions', ref);
        if (!data) {
            throw FileSystemProviderErrorCode.FileNotFound;
        }
        const content = JSON.parse(data.content);
        const change = content.folders.find((f) => f.name === folderName)?.workingChanges.find((change) => change.relativeFilePath === filePath);
        if (!change || change.type === ChangeType.Deletion) {
            throw FileSystemProviderErrorCode.FileNotFound;
        }
        return decodeEditSessionFileContent(content.version, change.contents).buffer;
    }
    async stat(resource) {
        const content = await this.readFile(resource);
        const currentTime = Date.now();
        return {
            type: FileType.File,
            permissions: FilePermission.Readonly,
            mtime: currentTime,
            ctime: currentTime,
            size: content.byteLength
        };
    }
    watch(resource, opts) { return Disposable.None; }
    async mkdir(resource) { }
    async readdir(resource) { return []; }
    async rename(from, to, opts) { }
    async delete(resource, opts) { }
    async writeFile() {
        throw new NotSupportedError();
    }
};
EditSessionsFileSystemProvider = __decorate([
    __param(0, IEditSessionsStorageService)
], EditSessionsFileSystemProvider);
export { EditSessionsFileSystemProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdFNlc3Npb25zRmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFNlc3Npb25zL2Jyb3dzZXIvZWRpdFNlc3Npb25zRmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLGNBQWMsRUFBa0MsMkJBQTJCLEVBQUUsUUFBUSxFQUFtSCxNQUFNLDRDQUE0QyxDQUFDO0FBQ3BRLE9BQU8sRUFBRSxVQUFVLEVBQUUsNEJBQTRCLEVBQUUsb0JBQW9CLEVBQWUsMkJBQTJCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNySixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUE4QjthQUUxQixXQUFNLEdBQUcsb0JBQW9CLEFBQXZCLENBQXdCO0lBRTlDLFlBQzhCLDBCQUErRDtRQUF2RCwrQkFBMEIsR0FBMUIsMEJBQTBCLENBQTZCO1FBR3BGLGlCQUFZLEdBQW1DLHlHQUFzRixDQUFDO1FBZ0MvSSxxQ0FBcUM7UUFDNUIsNEJBQXVCLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNyQyxvQkFBZSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7SUFwQ2xDLENBQUM7SUFJTCxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWE7UUFDM0IsTUFBTSxLQUFLLEdBQUcsc0RBQXNELENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdEcsSUFBSSxDQUFDLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztZQUNwQixNQUFNLDJCQUEyQixDQUFDLFlBQVksQ0FBQztRQUNoRCxDQUFDO1FBQ0QsTUFBTSxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQztRQUNuRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQzdFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE1BQU0sMkJBQTJCLENBQUMsWUFBWSxDQUFDO1FBQ2hELENBQUM7UUFDRCxNQUFNLE9BQU8sR0FBZ0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDdEQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLEVBQUUsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLGdCQUFnQixLQUFLLFFBQVEsQ0FBQyxDQUFDO1FBQ3pJLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLElBQUksS0FBSyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDcEQsTUFBTSwyQkFBMkIsQ0FBQyxZQUFZLENBQUM7UUFDaEQsQ0FBQztRQUNELE9BQU8sNEJBQTRCLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDO0lBQzlFLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSSxDQUFDLFFBQWE7UUFDdkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzlDLE1BQU0sV0FBVyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUMvQixPQUFPO1lBQ04sSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJO1lBQ25CLFdBQVcsRUFBRSxjQUFjLENBQUMsUUFBUTtZQUNwQyxLQUFLLEVBQUUsV0FBVztZQUNsQixLQUFLLEVBQUUsV0FBVztZQUNsQixJQUFJLEVBQUUsT0FBTyxDQUFDLFVBQVU7U0FDeEIsQ0FBQztJQUNILENBQUM7SUFNRCxLQUFLLENBQUMsUUFBYSxFQUFFLElBQW1CLElBQWlCLE9BQU8sVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFbEYsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFhLElBQW1CLENBQUM7SUFDN0MsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFhLElBQW1DLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUUxRSxLQUFLLENBQUMsTUFBTSxDQUFDLElBQVMsRUFBRSxFQUFPLEVBQUUsSUFBMkIsSUFBbUIsQ0FBQztJQUNoRixLQUFLLENBQUMsTUFBTSxDQUFDLFFBQWEsRUFBRSxJQUF3QixJQUFtQixDQUFDO0lBRXhFLEtBQUssQ0FBQyxTQUFTO1FBQ2QsTUFBTSxJQUFJLGlCQUFpQixFQUFFLENBQUM7SUFDL0IsQ0FBQzs7QUF0RFcsOEJBQThCO0lBS3hDLFdBQUEsMkJBQTJCLENBQUE7R0FMakIsOEJBQThCLENBd0QxQyJ9