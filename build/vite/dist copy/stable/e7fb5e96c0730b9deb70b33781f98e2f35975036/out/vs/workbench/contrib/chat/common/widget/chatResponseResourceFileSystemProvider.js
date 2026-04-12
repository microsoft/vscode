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
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileService } from '../../../../../platform/files/common/files.js';
import { ChatResponseResource } from '../model/chatModel.js';
import { IChatService, IChatToolInvocation } from '../chatService/chatService.js';
import { isToolResultInputOutputDetails } from '../tools/languageModelToolsService.js';
export const IChatResponseResourceFileSystemProvider = createDecorator('chatResponseResourceFileSystemProvider');
let ChatResponseResourceFileSystemProvider = class ChatResponseResourceFileSystemProvider extends Disposable {
    constructor(chatService, _fileService) {
        super();
        this.chatService = chatService;
        this._fileService = _fileService;
        this.onDidChangeCapabilities = Event.None;
        this.onDidChangeFile = Event.None;
        this.capabilities = 0 /* FileSystemProviderCapabilities.None */
            | 2048 /* FileSystemProviderCapabilities.Readonly */
            | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */
            | 16 /* FileSystemProviderCapabilities.FileReadStream */
            | 16384 /* FileSystemProviderCapabilities.FileAtomicRead */
            | 2 /* FileSystemProviderCapabilities.FileReadWrite */;
        /** In-memory store for data associated via {@link associate}, keyed by URI. */
        this._associated = new ResourceMap();
        /** Tracks which associated URIs belong to which session, for cleanup on dispose. */
        this._sessionAssociations = new ResourceMap();
        this._register(this.chatService.onDidDisposeSession(e => {
            for (const sessionResource of e.sessionResources) {
                const uris = this._sessionAssociations.get(sessionResource);
                if (uris) {
                    for (const uri of uris) {
                        this._associated.delete(uri);
                    }
                    this._sessionAssociations.delete(sessionResource);
                }
            }
        }));
    }
    associate(sessionResource, data, name) {
        const id = generateUuid();
        const uri = URI.from({
            scheme: ChatResponseResource.scheme,
            path: `/assoc/${id}` + (name ? `/${name}` : ''),
        });
        this._associated.set(uri, data);
        let set = this._sessionAssociations.get(sessionResource);
        if (!set) {
            set = new ResourceSet();
            this._sessionAssociations.set(sessionResource, set);
        }
        set.add(uri);
        return uri;
    }
    readFile(resource) {
        return Promise.resolve(this.lookupURI(resource));
    }
    readFileStream(resource) {
        const stream = newWriteableStream(data => VSBuffer.concat(data.map(data => VSBuffer.wrap(data))).buffer);
        Promise.resolve(this.lookupURI(resource)).then(v => stream.end(v));
        return stream;
    }
    async stat(resource) {
        const r = await this.lookupURI(resource);
        return {
            type: FileType.File,
            ctime: 0,
            mtime: 0,
            size: r.length,
        };
    }
    delete() {
        throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
    }
    watch() {
        return Disposable.None;
    }
    mkdir() {
        throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
    }
    readdir() {
        return Promise.resolve([]);
    }
    rename() {
        throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
    }
    writeFile() {
        throw createFileSystemProviderError('fs is readonly', FileSystemProviderErrorCode.NoPermissions);
    }
    findMatchingInvocation(uri) {
        const parsed = ChatResponseResource.parseUri(uri);
        if (!parsed) {
            throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
        }
        const { sessionResource, toolCallId, index } = parsed;
        const session = this.chatService.getSession(sessionResource);
        if (!session) {
            throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
        }
        const requests = session.getRequests();
        for (let k = requests.length - 1; k >= 0; k--) {
            const req = requests[k];
            const tc = req.response?.entireResponse.value.find((r) => (r.kind === 'toolInvocation' || r.kind === 'toolInvocationSerialized') && r.toolCallId === toolCallId);
            if (tc) {
                return { result: tc, index };
            }
        }
        throw createFileSystemProviderError(`File not found`, FileSystemProviderErrorCode.FileNotFound);
    }
    lookupURI(uri) {
        const associated = this._associated.get(uri);
        if (associated) {
            if (associated instanceof Uint8Array) {
                return associated;
            }
            const decoded = decodeBase64(associated.base64).buffer;
            this._associated.set(uri, decoded);
            return decoded;
        }
        const { result, index } = this.findMatchingInvocation(uri);
        const details = IChatToolInvocation.resultDetails(result);
        if (!isToolResultInputOutputDetails(details)) {
            throw createFileSystemProviderError(`Tool does not have I/O`, FileSystemProviderErrorCode.FileNotFound);
        }
        const part = details.output.at(index);
        if (!part) {
            throw createFileSystemProviderError(`Tool does not have part`, FileSystemProviderErrorCode.FileNotFound);
        }
        if (part.type === 'ref') {
            return this._fileService.readFile(part.uri).then(r => r.value.buffer);
        }
        return part.isText ? new TextEncoder().encode(part.value) : decodeBase64(part.value).buffer;
    }
};
ChatResponseResourceFileSystemProvider = __decorate([
    __param(0, IChatService),
    __param(1, IFileService)
], ChatResponseResourceFileSystemProvider);
export { ChatResponseResourceFileSystemProvider };
let ChatResponseResourceWorkbenchContribution = class ChatResponseResourceWorkbenchContribution extends Disposable {
    static { this.ID = 'chatResponseResourceWorkbenchContribution'; }
    constructor(chatResponseResourceFsProvider, fileService) {
        super();
        this._register(fileService.registerProvider(ChatResponseResource.scheme, chatResponseResourceFsProvider));
    }
};
ChatResponseResourceWorkbenchContribution = __decorate([
    __param(0, IChatResponseResourceFileSystemProvider),
    __param(1, IFileService)
], ChatResponseResourceWorkbenchContribution);
export { ChatResponseResourceWorkbenchContribution };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi93aWRnZXQvY2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUQsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLGtCQUFrQixFQUF3QixNQUFNLHNDQUFzQyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSw2QkFBNkIsRUFBa0MsMkJBQTJCLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBZ0wsTUFBTSwrQ0FBK0MsQ0FBQztBQUVqVyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsWUFBWSxFQUFFLG1CQUFtQixFQUFpQyxNQUFNLCtCQUErQixDQUFDO0FBQ2pILE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRXZGLE1BQU0sQ0FBQyxNQUFNLHVDQUF1QyxHQUFHLGVBQWUsQ0FBMEMsd0NB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