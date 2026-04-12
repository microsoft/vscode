/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { clamp } from '../../../../base/common/numbers.js';
import { assertNever } from '../../../../base/common/assert.js';
import { FilePermission, FileSystemProviderErrorCode, FileType, createFileSystemProviderError } from '../../../../platform/files/common/files.js';
import { DEBUG_MEMORY_SCHEME } from '../common/debug.js';
const rangeRe = /range=([0-9]+):([0-9]+)/;
export class DebugMemoryFileSystemProvider extends Disposable {
    constructor(debugService) {
        super();
        this.debugService = debugService;
        this.memoryFdCounter = 0;
        this.fdMemory = new Map();
        this.changeEmitter = this._register(new Emitter());
        /** @inheritdoc */
        this.onDidChangeCapabilities = Event.None;
        /** @inheritdoc */
        this.onDidChangeFile = this.changeEmitter.event;
        /** @inheritdoc */
        this.capabilities = 0
            | 1024 /* FileSystemProviderCapabilities.PathCaseSensitive */
            | 4 /* FileSystemProviderCapabilities.FileOpenReadWriteClose */;
        this._register(debugService.onDidEndSession(({ session }) => {
            for (const [fd, memory] of this.fdMemory) {
                if (memory.session === session) {
                    this.close(fd);
                }
            }
        }));
    }
    watch(resource, opts) {
        if (opts.recursive) {
            return toDisposable(() => { });
        }
        const { session, memoryReference, offset } = this.parseUri(resource);
        const disposable = new DisposableStore();
        disposable.add(session.onDidChangeState(() => {
            if (session.state === 3 /* State.Running */ || session.state === 0 /* State.Inactive */) {
                this.changeEmitter.fire([{ type: 2 /* FileChangeType.DELETED */, resource }]);
            }
        }));
        disposable.add(session.onDidInvalidateMemory(e => {
            if (e.body.memoryReference !== memoryReference) {
                return;
            }
            if (offset && (e.body.offset >= offset.toOffset || e.body.offset + e.body.count < offset.fromOffset)) {
                return;
            }
            this.changeEmitter.fire([{ resource, type: 0 /* FileChangeType.UPDATED */ }]);
        }));
        return disposable;
    }
    /** @inheritdoc */
    stat(file) {
        const { readOnly } = this.parseUri(file);
        return Promise.resolve({
            type: FileType.File,
            mtime: 0,
            ctime: 0,
            size: 0,
            permissions: readOnly ? FilePermission.Readonly : undefined,
        });
    }
    /** @inheritdoc */
    mkdir() {
        throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
    }
    /** @inheritdoc */
    readdir() {
        throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
    }
    /** @inheritdoc */
    delete() {
        throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
    }
    /** @inheritdoc */
    rename() {
        throw createFileSystemProviderError(`Not allowed`, FileSystemProviderErrorCode.NoPermissions);
    }
    /** @inheritdoc */
    open(resource, _opts) {
        const { session, memoryReference, offset } = this.parseUri(resource);
        const fd = this.memoryFdCounter++;
        let region = session.getMemory(memoryReference);
        if (offset) {
            region = new MemoryRegionView(region, offset);
        }
        this.fdMemory.set(fd, { session, region });
        return Promise.resolve(fd);
    }
    /** @inheritdoc */
    close(fd) {
        this.fdMemory.get(fd)?.region.dispose();
        this.fdMemory.delete(fd);
        return Promise.resolve();
    }
    /** @inheritdoc */
    async writeFile(resource, content) {
        const { offset } = this.parseUri(resource);
        if (!offset) {
            throw createFileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
        }
        const fd = await this.open(resource, { create: false });
        try {
            await this.write(fd, offset.fromOffset, content, 0, content.length);
        }
        finally {
            this.close(fd);
        }
    }
    /** @inheritdoc */
    async readFile(resource) {
        const { offset } = this.parseUri(resource);
        if (!offset) {
            throw createFileSystemProviderError(`Range must be present to read a file`, FileSystemProviderErrorCode.FileNotFound);
        }
        const data = new Uint8Array(offset.toOffset - offset.fromOffset);
        const fd = await this.open(resource, { create: false });
        try {
            await this.read(fd, offset.fromOffset, data, 0, data.length);
            return data;
        }
        finally {
            this.close(fd);
        }
    }
    /** @inheritdoc */
    async read(fd, pos, data, offset, length) {
        const memory = this.fdMemory.get(fd);
        if (!memory) {
            throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
        }
        const ranges = await memory.region.read(pos, length);
        let readSoFar = 0;
        for (const range of ranges) {
            switch (range.type) {
                case 1 /* MemoryRangeType.Unreadable */:
                    return readSoFar;
                case 2 /* MemoryRangeType.Error */:
                    if (readSoFar > 0) {
                        return readSoFar;
                    }
                    else {
                        throw createFileSystemProviderError(range.error, FileSystemProviderErrorCode.Unknown);
                    }
                case 0 /* MemoryRangeType.Valid */: {
                    const start = Math.max(0, pos - range.offset);
                    const toWrite = range.data.slice(start, Math.min(range.data.byteLength, start + (length - readSoFar)));
                    data.set(toWrite.buffer, offset + readSoFar);
                    readSoFar += toWrite.byteLength;
                    break;
                }
                default:
                    assertNever(range);
            }
        }
        return readSoFar;
    }
    /** @inheritdoc */
    write(fd, pos, data, offset, length) {
        const memory = this.fdMemory.get(fd);
        if (!memory) {
            throw createFileSystemProviderError(`No file with that descriptor open`, FileSystemProviderErrorCode.Unavailable);
        }
        return memory.region.write(pos, VSBuffer.wrap(data).slice(offset, offset + length));
    }
    parseUri(uri) {
        if (uri.scheme !== DEBUG_MEMORY_SCHEME) {
            throw createFileSystemProviderError(`Cannot open file with scheme ${uri.scheme}`, FileSystemProviderErrorCode.FileNotFound);
        }
        const session = this.debugService.getModel().getSession(uri.authority);
        if (!session) {
            throw createFileSystemProviderError(`Debug session not found`, FileSystemProviderErrorCode.FileNotFound);
        }
        let offset;
        const rangeMatch = rangeRe.exec(uri.query);
        if (rangeMatch) {
            offset = { fromOffset: Number(rangeMatch[1]), toOffset: Number(rangeMatch[2]) };
        }
        const [, memoryReference] = uri.path.split('/');
        return {
            session,
            offset,
            readOnly: !session.capabilities.supportsWriteMemoryRequest,
            sessionId: uri.authority,
            memoryReference: decodeURIComponent(memoryReference),
        };
    }
}
/** A wrapper for a MemoryRegion that references a subset of data in another region. */
class MemoryRegionView extends Disposable {
    constructor(parent, range) {
        super();
        this.parent = parent;
        this.range = range;
        this.invalidateEmitter = this._register(new Emitter());
        this.onDidInvalidate = this.invalidateEmitter.event;
        this.writable = parent.writable;
        this.width = range.toOffset - range.fromOffset;
        this._register(parent);
        this._register(parent.onDidInvalidate(e => {
            const fromOffset = clamp(e.fromOffset - range.fromOffset, 0, this.width);
            const toOffset = clamp(e.toOffset - range.fromOffset, 0, this.width);
            if (toOffset > fromOffset) {
                this.invalidateEmitter.fire({ fromOffset, toOffset });
            }
        }));
    }
    read(fromOffset, toOffset) {
        if (fromOffset < 0) {
            throw new RangeError(`Invalid fromOffset: ${fromOffset}`);
        }
        return this.parent.read(this.range.fromOffset + fromOffset, this.range.fromOffset + Math.min(toOffset, this.width));
    }
    write(offset, data) {
        return this.parent.write(this.range.fromOffset + offset, data);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdNZW1vcnkuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9kZWJ1Zy9icm93c2VyL2RlYnVnTWVtb3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFaEUsT0FBTyxFQUFvQyxjQUFjLEVBQWtDLDJCQUEyQixFQUFFLFFBQVEsRUFBMEQsNkJBQTZCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1USxPQUFPLEVBQUUsbUJBQW1CLEVBQThHLE1BQU0sb0JBQW9CLENBQUM7QUFFckssTUFBTSxPQUFPLEdBQUcseUJBQXlCLENBQUM7QUFFMUMsTUFBTSxPQUFPLDZCQUE4QixTQUFRLFVBQVU7SUFnQjVELFlBQTZCLFlBQTJCO1FBQ3ZELEtBQUssRUFBRSxDQUFDO1FBRG9CLGlCQUFZLEdBQVosWUFBWSxDQUFlO1FBZmhELG9CQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsYUFBUSxHQUFHLElBQUksR0FBRyxFQUE2RCxDQUFDO1FBQ2hGLGtCQUFhLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEIsQ0FBQyxDQUFDO1FBRXZGLGtCQUFrQjtRQUNGLDRCQUF1QixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFFckQsa0JBQWtCO1FBQ0Ysb0JBQWUsR0FB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