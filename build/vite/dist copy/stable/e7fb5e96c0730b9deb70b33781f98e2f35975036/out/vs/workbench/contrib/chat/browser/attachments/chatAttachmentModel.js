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
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { basename } from '../../../../../base/common/resources.js';
import { combinedDisposable, Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { IChatRequestVariableEntry, isPromptFileVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IChatAttachmentResolveService } from './chatAttachmentResolveService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { equals } from '../../../../../base/common/objects.js';
import { Iterable } from '../../../../../base/common/iterator.js';
let ChatAttachmentModel = class ChatAttachmentModel extends Disposable {
    constructor(fileService, webContentExtractorService, chatAttachmentResolveService) {
        super();
        this.fileService = fileService;
        this.webContentExtractorService = webContentExtractorService;
        this.chatAttachmentResolveService = chatAttachmentResolveService;
        this._attachments = new Map();
        this._fileWatchers = this._register(new DisposableMap());
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
    }
    get attachments() {
        return Array.from(this._attachments.values());
    }
    get size() {
        return this._attachments.size;
    }
    get fileAttachments() {
        return this.attachments.filter(file => file.kind === 'file' && URI.isUri(file.value))
            .map(file => file.value);
    }
    getAttachmentIDs() {
        return new Set(this._attachments.keys());
    }
    async addFile(uri, range) {
        if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(uri.path)) {
            const context = await this.asImageVariableEntry(uri);
            if (context) {
                this.addContext(context);
            }
            return;
        }
        else {
            this.addContext(this.asFileVariableEntry(uri, range));
        }
    }
    addFolder(uri) {
        this.addContext({
            kind: 'directory',
            value: uri,
            id: uri.toString(),
            name: basename(uri),
        });
    }
    clear(clearStickyAttachments = false) {
        if (clearStickyAttachments) {
            const deleted = Array.from(this._attachments.keys());
            this._attachments.clear();
            this._fileWatchers.clearAndDisposeAll();
            this._onDidChange.fire({ deleted, added: [], updated: [] });
        }
        else {
            const deleted = [];
            const allIds = Array.from(this._attachments.keys());
            for (const id of allIds) {
                const entry = this._attachments.get(id);
                if (entry && !isPromptFileVariableEntry(entry)) {
                    this._attachments.delete(id);
                    this._fileWatchers.deleteAndDispose(id);
                    deleted.push(id);
                }
            }
            this._onDidChange.fire({ deleted, added: [], updated: [] });
        }
    }
    addContext(...attachments) {
        attachments = attachments.filter(attachment => !this._attachments.has(attachment.id));
        this.updateContext(Iterable.empty(), attachments);
    }
    clearAndSetContext(...attachments) {
        this.updateContext(Array.from(this._attachments.keys()), attachments);
    }
    delete(...variableEntryIds) {
        this.updateContext(variableEntryIds, Iterable.empty());
    }
    updateContext(toDelete, upsert) {
        const deleted = [];
        const added = [];
        const updated = [];
        for (const id of toDelete) {
            const item = this._attachments.get(id);
            if (item) {
                this._attachments.delete(id);
                deleted.push(id);
                this._fileWatchers.deleteAndDispose(id);
            }
        }
        for (const item of upsert) {
            const oldItem = this._attachments.get(item.id);
            if (!oldItem) {
                this._attachments.set(item.id, item);
                added.push(item);
                this._watchAttachment(item);
            }
            else if (!equals(oldItem, item)) {
                this._fileWatchers.deleteAndDispose(item.id);
                this._attachments.set(item.id, item);
                updated.push(item);
                this._watchAttachment(item);
            }
        }
        if (deleted.length > 0 || added.length > 0 || updated.length > 0) {
            this._onDidChange.fire({ deleted, added, updated });
        }
    }
    _watchAttachment(attachment) {
        const uri = IChatRequestVariableEntry.toUri(attachment);
        if (!uri || uri.scheme !== Schemas.file) {
            return;
        }
        const watcher = this.fileService.createWatcher(uri, { recursive: false, excludes: [] });
        const onDidChangeListener = watcher.onDidChange(e => {
            if (e.contains(uri, 2 /* FileChangeType.DELETED */)) {
                this.updateContext([attachment.id], Iterable.empty());
            }
        });
        this._fileWatchers.set(attachment.id, combinedDisposable(onDidChangeListener, watcher));
    }
    // ---- create utils
    asFileVariableEntry(uri, range) {
        return {
            kind: 'file',
            value: range ? { uri, range } : uri,
            id: uri.toString() + (range?.toString() ?? ''),
            name: basename(uri),
        };
    }
    // Gets an image variable for a given URI, which may be a file or a web URL
    async asImageVariableEntry(uri) {
        if (uri.scheme === Schemas.file && await this.fileService.canHandleResource(uri)) {
            return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri);
        }
        else if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
            const extractedImages = await this.webContentExtractorService.readImage(uri, CancellationToken.None);
            if (extractedImages) {
                return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri, extractedImages);
            }
        }
        return undefined;
    }
};
ChatAttachmentModel = __decorate([
    __param(0, IFileService),
    __param(1, ISharedWebContentExtractorService),
    __param(2, IChatAttachmentResolveService)
], ChatAttachmentModel);
export { ChatAttachmentModel };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudE1vZGVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDOUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDckgsT0FBTyxFQUF5Qix5QkFBeUIsRUFBRSx5QkFBeUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzlJLE9BQU8sRUFBa0IsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0YsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sMkVBQTJFLENBQUM7QUFDOUgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFRM0QsSUFBTSxtQkFBbUIsR0FBekIsTUFBTSxtQkFBb0IsU0FBUSxVQUFVO0lBUWxELFlBQ2UsV0FBMEMsRUFDckIsMEJBQThFLEVBQ2xGLDRCQUE0RTtRQUUzRyxLQUFLLEVBQUUsQ0FBQztR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