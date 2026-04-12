/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
export class NullFileSystemProvider {
    constructor(disposableFactory = () => Disposable.None) {
        this.disposableFactory = disposableFactory;
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */;
        this._onDidChangeCapabilities = new Emitter();
        this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
        this._onDidChangeFile = new Emitter();
        this.onDidChangeFile = this._onDidChangeFile.event;
    }
    emitFileChangeEvents(changes) {
        this._onDidChangeFile.fire(changes);
    }
    setCapabilities(capabilities) {
        this.capabilities = capabilities;
        this._onDidChangeCapabilities.fire();
    }
    watch(resource, opts) { return this.disposableFactory(); }
    async stat(resource) { return undefined; }
    async mkdir(resource) { return undefined; }
    async readdir(resource) { return undefined; }
    async delete(resource, opts) { return undefined; }
    async rename(from, to, opts) { return undefined; }
    async copy(from, to, opts) { return undefined; }
    async readFile(resource) { return undefined; }
    readFileStream(resource, opts, token) { return undefined; }
    async writeFile(resource, content, opts) { return undefined; }
    async open(resource, opts) { return undefined; }
    async close(fd) { return undefined; }
    async read(fd, pos, data, offset, length) { return undefined; }
    async write(fd, pos, data, offset, length) { return undefined; }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibnVsbEZpbGVTeXN0ZW1Qcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2ZpbGVzL3Rlc3QvY29tbW9uL251bGxGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLE9BQU8sRUFBUyxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUsvRSxNQUFNLE9BQU8sc0JBQXNCO0lBVWxDLFlBQW9CLG9CQUF1QyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSTtRQUE1RCxzQkFBaUIsR0FBakIsaUJBQWlCLENBQTJDO1FBUmhGLGlCQUFZLHNEQUEyRTtRQUV0RSw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO1FBQ3ZELDRCQUF1QixHQUFnQixJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDO1FBRW5FLHFCQUFnQixHQUFHLElBQUksT0FBTyxFQUEwQixDQUFDO1FBQ2pFLG9CQUFlLEdBQWtDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7SUFFRixDQUFDO0lBRXJGLG9CQUFvQixDQUFDLE9BQXNCO1FBQzFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDckMsQ0FBQztJQUVELGVBQWUsQ0FBQyxZQUE0QztRQUMzRCxJQUFJLENBQUMsWUFBWSxHQUFHLFlBQVksQ0FBQztRQUVqQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDdEMsQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFhLEVBQUUsSUFBbUIsSUFBaUIsT0FBTyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDM0YsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFhLElBQW9CLE9BQU8sU0FBVSxDQUFDLENBQUMsQ0FBQztJQUNoRSxLQUFLLENBQUMsS0FBSyxDQUFDLFFBQWEsSUFBbUIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQy9ELEtBQUssQ0FBQyxPQUFPLENBQUMsUUFBYSxJQUFtQyxPQUFPLFNBQVUsQ0FBQyxDQUFDLENBQUM7SUFDbEYsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFhLEVBQUUsSUFBd0IsSUFBbUIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQzFGLEtBQUssQ0FBQyxNQUFNLENBQUMsSUFBUyxFQUFFLEVBQU8sRUFBRSxJQUEyQixJQUFtQixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDbEcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFTLEVBQUUsRUFBTyxFQUFFLElBQTJCLElBQW1CLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQztJQUNoRyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWEsSUFBeUIsT0FBTyxTQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ3pFLGNBQWMsQ0FBQyxRQUFhLEVBQUUsSUFBNEIsRUFBRSxLQUF3QixJQUFzQyxPQUFPLFNBQVUsQ0FBQyxDQUFDLENBQUM7SUFDOUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxRQUFhLEVBQUUsT0FBbUIsRUFBRSxJQUF1QixJQUFtQixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDakgsS0FBSyxDQUFDLElBQUksQ0FBQyxRQUFhLEVBQUUsSUFBc0IsSUFBcUIsT0FBTyxTQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ3pGLEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBVSxJQUFtQixPQUFPLFNBQVMsQ0FBQyxDQUFDLENBQUM7SUFDNUQsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFVLEVBQUUsR0FBVyxFQUFFLElBQWdCLEVBQUUsTUFBYyxFQUFFLE1BQWMsSUFBcUIsT0FBTyxTQUFVLENBQUMsQ0FBQyxDQUFDO0lBQzdILEtBQUssQ0FBQyxLQUFLLENBQUMsRUFBVSxFQUFFLEdBQVcsRUFBRSxJQUFnQixFQUFFLE1BQWMsRUFBRSxNQUFjLElBQXFCLE9BQU8sU0FBVSxDQUFDLENBQUMsQ0FBQztDQUM5SCJ9