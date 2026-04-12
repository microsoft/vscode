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
var ExtHostDiagnostics_1;
import { localize } from '../../../nls.js';
import { MarkerSeverity } from '../../../platform/markers/common/markers.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { DiagnosticSeverity } from './extHostTypes.js';
import * as converter from './extHostTypeConverters.js';
import { Event, DebounceEmitter } from '../../../base/common/event.js';
import { coalesce } from '../../../base/common/arrays.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ResourceMap } from '../../../base/common/map.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
export class DiagnosticCollection {
    #proxy;
    #onDidChangeDiagnostics;
    #data;
    constructor(_name, _owner, _maxDiagnosticsTotal, _maxDiagnosticsPerFile, _modelVersionIdProvider, extUri, proxy, onDidChangeDiagnostics) {
        this._name = _name;
        this._owner = _owner;
        this._maxDiagnosticsTotal = _maxDiagnosticsTotal;
        this._maxDiagnosticsPerFile = _maxDiagnosticsPerFile;
        this._modelVersionIdProvider = _modelVersionIdProvider;
        this._isDisposed = false;
        this._maxDiagnosticsTotal = Math.max(_maxDiagnosticsPerFile, _maxDiagnosticsTotal);
        this.#data = new ResourceMap(uri => extUri.getComparisonKey(uri));
        this.#proxy = proxy;
        this.#onDidChangeDiagnostics = onDidChangeDiagnostics;
    }
    dispose() {
        if (!this._isDisposed) {
            this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
            this.#proxy?.$clear(this._owner);
            this.#data.clear();
            this._isDisposed = true;
        }
    }
    get name() {
        this._checkDisposed();
        return this._name;
    }
    set(first, diagnostics) {
        if (!first) {
            // this set-call is a clear-call
            this.clear();
            return;
        }
        // the actual implementation for #set
        this._checkDisposed();
        let toSync = [];
        if (URI.isUri(first)) {
            if (!diagnostics) {
                // remove this entry
                this.delete(first);
                return;
            }
            // update single row
            this.#data.set(first, coalesce(diagnostics));
            toSync = [first];
        }
        else if (Array.isArray(first)) {
            // update many rows
            toSync = [];
            let lastUri;
            // ensure stable-sort
            first = [...first].sort(DiagnosticCollection._compareIndexedTuplesByUri);
            for (const tuple of first) {
                const [uri, diagnostics] = tuple;
                if (!lastUri || uri.toString() !== lastUri.toString()) {
                    if (lastUri && this.#data.get(lastUri).length === 0) {
                        this.#data.delete(lastUri);
                    }
                    lastUri = uri;
                    toSync.push(uri);
                    this.#data.set(uri, []);
                }
                if (!diagnostics) {
                    // [Uri, undefined] means clear this
                    const currentDiagnostics = this.#data.get(uri);
                    if (currentDiagnostics) {
                        currentDiagnostics.length = 0;
                    }
                }
                else {
                    const currentDiagnostics = this.#data.get(uri);
                    currentDiagnostics?.push(...coalesce(diagnostics));
                }
            }
        }
        // send event for extensions
        this.#onDidChangeDiagnostics.fire(toSync);
        // compute change and send to main side
        if (!this.#proxy) {
            return;
        }
        const entries = [];
        let totalMarkerCount = 0;
        for (const uri of toSync) {
            let marker = [];
            const diagnostics = this.#data.get(uri);
            if (diagnostics) {
                // no more than N diagnostics per file
                if (diagnostics.length > this._maxDiagnosticsPerFile) {
                    marker = [];
                    const order = [DiagnosticSeverity.Error, DiagnosticSeverity.Warning, DiagnosticSeverity.Information, DiagnosticSeverity.Hint];
                    orderLoop: for (let i = 0; i < 4; i++) {
                        for (const diagnostic of diagnostics) {
                            if (diagnostic.severity === order[i]) {
                                const len = marker.push({ ...converter.Diagnostic.from(diagnostic), modelVersionId: this._modelVersionIdProvider(uri) });
                                if (len === this._maxDiagnosticsPerFile) {
                                    break orderLoop;
                                }
                            }
                        }
                    }
                    // add 'signal' marker for showing omitted errors/warnings
                    marker.push({
                        severity: MarkerSeverity.Info,
                        message: localize({ key: 'limitHit', comment: ['amount of errors/warning skipped due to limits'] }, "Not showing {0} further errors and warnings.", diagnostics.length - this._maxDiagnosticsPerFile),
                        startLineNumber: marker[marker.length - 1].startLineNumber,
                        startColumn: marker[marker.length - 1].startColumn,
                        endLineNumber: marker[marker.length - 1].endLineNumber,
                        endColumn: marker[marker.length - 1].endColumn
                    });
                }
                else {
                    marker = diagnostics.map(diag => ({ ...converter.Diagnostic.from(diag), modelVersionId: this._modelVersionIdProvider(uri) }));
                }
            }
            entries.push([uri, marker]);
            totalMarkerCount += marker.length;
            if (totalMarkerCount > this._maxDiagnosticsTotal) {
                // ignore markers that are above the limit
                break;
            }
        }
        this.#proxy.$changeMany(this._owner, entries);
    }
    delete(uri) {
        this._checkDisposed();
        this.#onDidChangeDiagnostics.fire([uri]);
        this.#data.delete(uri);
        this.#proxy?.$changeMany(this._owner, [[uri, undefined]]);
    }
    clear() {
        this._checkDisposed();
        this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
        this.#data.clear();
        this.#proxy?.$clear(this._owner);
    }
    forEach(callback, thisArg) {
        this._checkDisposed();
        for (const [uri, values] of this) {
            callback.call(thisArg, uri, values, this);
        }
    }
    *[Symbol.iterator]() {
        this._checkDisposed();
        for (const uri of this.#data.keys()) {
            yield [uri, this.get(uri)];
        }
    }
    get(uri) {
        this._checkDisposed();
        const result = this.#data.get(uri);
        if (Array.isArray(result)) {
            return Object.freeze(result.slice(0));
        }
        return [];
    }
    has(uri) {
        this._checkDisposed();
        return Array.isArray(this.#data.get(uri));
    }
    _checkDisposed() {
        if (this._isDisposed) {
            throw new Error('illegal state - object is disposed');
        }
    }
    static _compareIndexedTuplesByUri(a, b) {
        if (a[0].toString() < b[0].toString()) {
            return -1;
        }
        else if (a[0].toString() > b[0].toString()) {
            return 1;
        }
        else {
            return 0;
        }
    }
}
let ExtHostDiagnostics = class ExtHostDiagnostics {
    static { ExtHostDiagnostics_1 = this; }
    static { this._idPool = 0; }
    static { this._maxDiagnosticsPerFile = 1000; }
    static { this._maxDiagnosticsTotal = 1.1 * this._maxDiagnosticsPerFile; }
    static _mapper(last) {
        const map = new ResourceMap();
        for (const uri of last) {
            map.set(uri, uri);
        }
        return { uris: Object.freeze(Array.from(map.values())) };
    }
    constructor(mainContext, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors) {
        this._logService = _logService;
        this._fileSystemInfoService = _fileSystemInfoService;
        this._extHostDocumentsAndEditors = _extHostDocumentsAndEditors;
        this._collections = new Map();
        this._onDidChangeDiagnostics = new DebounceEmitter({ merge: all => all.flat(), delay: 50 });
        this.onDidChangeDiagnostics = Event.map(this._onDidChangeDiagnostics.event, ExtHostDiagnostics_1._mapper);
        this._proxy = mainContext.getProxy(MainContext.MainThreadDiagnostics);
    }
    createDiagnosticCollection(extensionId, name) {
        const { _collections, _proxy, _onDidChangeDiagnostics, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors } = this;
        const loggingProxy = new class {
            $changeMany(owner, entries) {
                _proxy.$changeMany(owner, entries);
                _logService.trace('[DiagnosticCollection] change many (extension, owner, uris)', extensionId.value, owner, entries.length === 0 ? 'CLEARING' : entries);
            }
            $clear(owner) {
                _proxy.$clear(owner);
                _logService.trace('[DiagnosticCollection] remove all (extension, owner)', extensionId.value, owner);
            }
            dispose() {
                _proxy.dispose();
            }
        };
        let owner;
        if (!name) {
            name = '_generated_diagnostic_collection_name_#' + ExtHostDiagnostics_1._idPool++;
            owner = name;
        }
        else if (!_collections.has(name)) {
            owner = name;
        }
        else {
            this._logService.warn(`DiagnosticCollection with name '${name}' does already exist.`);
            do {
                owner = name + ExtHostDiagnostics_1._idPool++;
            } while (_collections.has(owner));
        }
        const result = new class extends DiagnosticCollection {
            constructor() {
                super(name, owner, ExtHostDiagnostics_1._maxDiagnosticsTotal, ExtHostDiagnostics_1._maxDiagnosticsPerFile, uri => _extHostDocumentsAndEditors.getDocument(uri)?.version, _fileSystemInfoService.extUri, loggingProxy, _onDidChangeDiagnostics);
                _collections.set(owner, this);
            }
            dispose() {
                super.dispose();
                _collections.delete(owner);
            }
        };
        return result;
    }
    getDiagnostics(resource) {
        if (resource) {
            return this._getDiagnostics(resource);
        }
        else {
            const index = new Map();
            const res = [];
            for (const collection of this._collections.values()) {
                collection.forEach((uri, diagnostics) => {
                    let idx = index.get(uri.toString());
                    if (typeof idx === 'undefined') {
                        idx = res.length;
                        index.set(uri.toString(), idx);
                        res.push([uri, []]);
                    }
                    res[idx][1] = res[idx][1].concat(...diagnostics);
                });
            }
            return res;
        }
    }
    _getDiagnostics(resource) {
        let res = [];
        for (const collection of this._collections.values()) {
            if (collection.has(resource)) {
                res = res.concat(collection.get(resource));
            }
        }
        return res;
    }
    $acceptMarkersChange(data) {
        if (!this._mirrorCollection) {
            const name = '_generated_mirror';
            const collection = new DiagnosticCollection(name, name, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, // no limits because this collection is just a mirror of "sanitized" data
            // no limits because this collection is just a mirror of "sanitized" data
            _uri => undefined, this._fileSystemInfoService.extUri, undefined, this._onDidChangeDiagnostics);
            this._collections.set(name, collection);
            this._mirrorCollection = collection;
        }
        for (const [uri, markers] of data) {
            this._mirrorCollection.set(URI.revive(uri), markers.map(converter.Diagnostic.to));
        }
    }
};
ExtHostDiagnostics = ExtHostDiagnostics_1 = __decorate([
    __param(1, ILogService),
    __param(2, IExtHostFileSystemInfo)
], ExtHostDiagnostics);
export { ExtHostDiagnostics };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdERpYWdub3N0aWNzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdERpYWdub3N0aWNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDM0MsT0FBTyxFQUFlLGNBQWMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzFGLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFFakUsT0FBTyxFQUFFLFdBQVcsRUFBcUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN2SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN2RCxPQUFPLEtBQUssU0FBUyxNQUFNLDRCQUE0QixDQUFDO0FBQ3hELE9BQU8sRUFBRSxLQUFLLEVBQVcsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFMUQsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFJcEUsTUFBTSxPQUFPLG9CQUFvQjtJQUV2QixNQUFNLENBQXlDO0lBQy9DLHVCQUF1QixDQUFpQztJQUN4RCxLQUFLLENBQW1DO0lBSWpELFlBQ2tCLEtBQWEsRUFDYixNQUFjLEVBQ2Qsb0JBQTRCLEVBQzVCLHNCQUE4QixFQUM5Qix1QkFBeUQsRUFDMUUsTUFBZSxFQUNmLEtBQTZDLEVBQzdDLHNCQUFzRDtRQVByQyxVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQ2IsV0FB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