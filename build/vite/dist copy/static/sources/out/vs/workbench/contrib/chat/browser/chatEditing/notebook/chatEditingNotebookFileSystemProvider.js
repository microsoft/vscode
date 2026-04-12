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
var ChatEditingNotebookFileSystemProvider_1;
import { Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { FileType, IFileService } from '../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { LocalChatSessionUri } from '../../../common/model/chatUri.js';
import { ChatEditingNotebookSnapshotScheme } from './chatEditingModifiedNotebookSnapshot.js';
let ChatEditingNotebookFileSystemProviderContrib = class ChatEditingNotebookFileSystemProviderContrib extends Disposable {
    static { this.ID = 'chatEditingNotebookFileSystemProviderContribution'; }
    constructor(fileService, instantiationService) {
        super();
        this.fileService = fileService;
        const fileSystemProvider = instantiationService.createInstance(ChatEditingNotebookFileSystemProvider);
        this._register(this.fileService.registerProvider(ChatEditingNotebookSnapshotScheme, fileSystemProvider));
    }
};
ChatEditingNotebookFileSystemProviderContrib = __decorate([
    __param(0, IFileService),
    __param(1, IInstantiationService)
], ChatEditingNotebookFileSystemProviderContrib);
export { ChatEditingNotebookFileSystemProviderContrib };
let ChatEditingNotebookFileSystemProvider = class ChatEditingNotebookFileSystemProvider {
    static { ChatEditingNotebookFileSystemProvider_1 = this; }
    static { this.registeredFiles = new ResourceMap(); }
    static registerFile(resource, buffer) {
        ChatEditingNotebookFileSystemProvider_1.registeredFiles.set(resource, buffer);
        return {
            dispose() {
                if (ChatEditingNotebookFileSystemProvider_1.registeredFiles.get(resource) === buffer) {
                    ChatEditingNotebookFileSystemProvider_1.registeredFiles.delete(resource);
                }
            }
        };
    }
    constructor(_chatEditingService) {
        this._chatEditingService = _chatEditingService;
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */ | 16384 /* FileSystemProviderCapabilities.FileAtomicRead */ | 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
    }
    watch(_resource, _opts) {
        return Disposable.None;
    }
    async stat(_resource) {
        return {
            type: FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0
        };
    }
    mkdir(_resource) {
        throw new Error('Method not implemented1.');
    }
    readdir(_resource) {
        throw new Error('Method not implemented2.');
    }
    delete(_resource, _opts) {
        throw new Error('Method not implemented3.');
    }
    rename(_from, _to, _opts) {
        throw new Error('Method not implemented4.');
    }
    copy(_from, _to, _opts) {
        throw new Error('Method not implemented5.');
    }
    async readFile(resource) {
        const buffer = ChatEditingNotebookFileSystemProvider_1.registeredFiles.get(resource);
        if (buffer) {
            return buffer.buffer;
        }
        const queryData = JSON.parse(resource.query);
        if (!queryData.viewType) {
            throw new Error('File not found, viewType not found');
        }
        const session = this._chatEditingService.getEditingSession(LocalChatSessionUri.forSession(queryData.sessionId));
        if (!session || !queryData.requestId) {
            throw new Error('File not found, session not found');
        }
        const snapshotEntry = await session.getSnapshotContents(queryData.requestId, resource, queryData.undoStop || undefined);
        if (!snapshotEntry) {
            throw new Error('File not found, snapshot not found');
        }
        return snapshotEntry.buffer;
    }
    writeFile(__resource, _content, _opts) {
        throw new Error('Method not implemented7.');
    }
    readFileStream(__resource, _opts, _token) {
        throw new Error('Method not implemented8.');
    }
    open(__resource, _opts) {
        throw new Error('Method not implemented9.');
    }
    close(_fd) {
        throw new Error('Method not implemented10.');
    }
    read(_fd, _pos, _data, _offset, _length) {
        throw new Error('Method not implemented11.');
    }
    write(_fd, _pos, _data, _offset, _length) {
        throw new Error('Method not implemented12.');
    }
    cloneFile(_from, __to) {
        throw new Error('Method not implemented13.');
    }
};
ChatEditingNotebookFileSystemProvider = ChatEditingNotebookFileSystemProvider_1 = __decorate([
    __param(0, IChatEditingService)
], ChatEditingNotebookFileSystemProvider);
export { ChatEditingNotebookFileSystemProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEVkaXRpbmdOb3RlYm9va0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ05vdGVib29rRmlsZVN5c3RlbVByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUloRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUduRSxPQUFPLEVBQWtDLFFBQVEsRUFBb0csWUFBWSxFQUFnRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzFSLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRXpHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBR3RGLElBQU0sNENBQTRDLEdBQWxELE1BQU0sNENBQTZDLFNBQVEsVUFBVTthQUNwRSxPQUFFLEdBQUcsbURBQW1ELEFBQXRELENBQXVEO0lBQ2hFLFlBQ2dDLFdBQXlCLEVBQ2pDLG9CQUEyQztRQUdsRSxLQUFLLEVBQUUsQ0FBQztRQUp1QixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUt4RCxNQUFNLGtCQUFrQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFdB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