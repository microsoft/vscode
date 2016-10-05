/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

/// <reference no-default-lib="true"/>

/////////////////////////////
/// IE Worker APIs
/////////////////////////////

interface Algorithm {
    name: string;
}

interface EventInit {
    bubbles?: boolean;
    cancelable?: boolean;
}

interface IDBIndexParameters {
    multiEntry?: boolean;
    unique?: boolean;
}

interface IDBObjectStoreParameters {
    autoIncrement?: boolean;
    keyPath?: IDBKeyPath;
}

interface KeyAlgorithm {
    name?: string;
}

interface EventListener {
    (evt: Event): void;
}

interface AudioBuffer {
    readonly duration: number;
    readonly length: number;
    readonly numberOfChannels: number;
    readonly sampleRate: number;
    copyFromChannel(destination: Float32Array, channelNumber: number, startInChannel?: number): void;
    copyToChannel(source: Float32Array, channelNumber: number, startInChannel?: number): void;
    getChannelData(channel: number): Float32Array;
}

declare var AudioBuffer: {
    prototype: AudioBuffer;
    new(): AudioBuffer;
}

interface Blob {
    readonly size: number;
    readonly type: string;
    msClose(): void;
    msDetachStream(): any;
    slice(start?: number, end?: number, contentType?: string): Blob;
}

declare var Blob: {
    prototype: Blob;
    new (blobParts?: any[], options?: BlobPropertyBag): Blob;
}

interface CloseEvent extends Event {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
    initCloseEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, wasCleanArg: boolean, codeArg: number, reasonArg: string): void;
}

declare var CloseEvent: {
    prototype: CloseEvent;
    new(): CloseEvent;
}

interface Console {
    assert(test?: boolean, message?: string, ...optionalParams: any[]): void;
    clear(): void;
    count(countTitle?: string): void;
    debug(message?: string, ...optionalParams: any[]): void;
    dir(value?: any, ...optionalParams: any[]): void;
    dirxml(value: any): void;
    error(message?: any, ...optionalParams: any[]): void;
    exception(message?: string, ...optionalParams: any[]): void;
    group(groupTitle?: string): void;
    groupCollapsed(groupTitle?: string): void;
    groupEnd(): void;
    info(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
    msIsIndependentlyComposed(element: any): boolean;
    profile(reportName?: string): void;
    profileEnd(): void;
    select(element: any): void;
    table(...data: any[]): void;
    time(timerName?: string): void;
    timeEnd(timerName?: string): void;
    trace(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
}

declare var Console: {
    prototype: Console;
    new(): Console;
}

interface Coordinates {
    readonly accuracy: number;
    readonly altitude: number | null;
    readonly altitudeAccuracy: number | null;
    readonly heading: number | null;
    readonly latitude: number;
    readonly longitude: number;
    readonly speed: number | null;
}

declare var Coordinates: {
    prototype: Coordinates;
    new(): Coordinates;
}

interface CryptoKey {
    readonly algorithm: KeyAlgorithm;
    readonly extractable: boolean;
    readonly type: string;
    readonly usages: string[];
}

declare var CryptoKey: {
    prototype: CryptoKey;
    new(): CryptoKey;
}

interface DOMError {
    readonly name: string;
    toString(): string;
}

declare var DOMError: {
    prototype: DOMError;
    new(): DOMError;
}

interface DOMException {
    readonly code: number;
    readonly message: string;
    readonly name: string;
    toString(): string;
    readonly ABORT_ERR: number;
    readonly DATA_CLONE_ERR: number;
    readonly DOMSTRING_SIZE_ERR: number;
    readonly HIERARCHY_REQUEST_ERR: number;
    readonly INDEX_SIZE_ERR: number;
    readonly INUSE_ATTRIBUTE_ERR: number;
    readonly INVALID_ACCESS_ERR: number;
    readonly INVALID_CHARACTER_ERR: number;
    readonly INVALID_MODIFICATION_ERR: number;
    readonly INVALID_NODE_TYPE_ERR: number;
    readonly INVALID_STATE_ERR: number;
    readonly NAMESPACE_ERR: number;
    readonly NETWORK_ERR: number;
    readonly NOT_FOUND_ERR: number;
    readonly NOT_SUPPORTED_ERR: number;
    readonly NO_DATA_ALLOWED_ERR: number;
    readonly NO_MODIFICATION_ALLOWED_ERR: number;
    readonly PARSE_ERR: number;
    readonly QUOTA_EXCEEDED_ERR: number;
    readonly SECURITY_ERR: number;
    readonly SERIALIZE_ERR: number;
    readonly SYNTAX_ERR: number;
    readonly TIMEOUT_ERR: number;
    readonly TYPE_MISMATCH_ERR: number;
    readonly URL_MISMATCH_ERR: number;
    readonly VALIDATION_ERR: number;
    readonly WRONG_DOCUMENT_ERR: number;
}

declare var DOMException: {
    prototype: DOMException;
    new(): DOMException;
    readonly ABORT_ERR: number;
    readonly DATA_CLONE_ERR: number;
    readonly DOMSTRING_SIZE_ERR: number;
    readonly HIERARCHY_REQUEST_ERR: number;
    readonly INDEX_SIZE_ERR: number;
    readonly INUSE_ATTRIBUTE_ERR: number;
    readonly INVALID_ACCESS_ERR: number;
    readonly INVALID_CHARACTER_ERR: number;
    readonly INVALID_MODIFICATION_ERR: number;
    readonly INVALID_NODE_TYPE_ERR: number;
    readonly INVALID_STATE_ERR: number;
    readonly NAMESPACE_ERR: number;
    readonly NETWORK_ERR: number;
    readonly NOT_FOUND_ERR: number;
    readonly NOT_SUPPORTED_ERR: number;
    readonly NO_DATA_ALLOWED_ERR: number;
    readonly NO_MODIFICATION_ALLOWED_ERR: number;
    readonly PARSE_ERR: number;
    readonly QUOTA_EXCEEDED_ERR: number;
    readonly SECURITY_ERR: number;
    readonly SERIALIZE_ERR: number;
    readonly SYNTAX_ERR: number;
    readonly TIMEOUT_ERR: number;
    readonly TYPE_MISMATCH_ERR: number;
    readonly URL_MISMATCH_ERR: number;
    readonly VALIDATION_ERR: number;
    readonly WRONG_DOCUMENT_ERR: number;
}

interface DOMStringList {
    readonly length: number;
    contains(str: string): boolean;
    item(index: number): string | null;
    [index: number]: string;
}

declare var DOMStringList: {
    prototype: DOMStringList;
    new(): DOMStringList;
}

interface ErrorEvent extends Event {
    readonly colno: number;
    readonly error: any;
    readonly filename: string;
    readonly lineno: number;
    readonly message: string;
    initErrorEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, messageArg: string, filenameArg: string, linenoArg: number): void;
}

declare var ErrorEvent: {
    prototype: ErrorEvent;
    new(): ErrorEvent;
}

interface Event {
    readonly bubbles: boolean;
    cancelBubble: boolean;
    readonly cancelable: boolean;
    readonly currentTarget: EventTarget;
    readonly defaultPrevented: boolean;
    readonly eventPhase: number;
    readonly isTrusted: boolean;
    returnValue: boolean;
    readonly srcElement: any;
    readonly target: EventTarget;
    readonly timeStamp: number;
    readonly type: string;
    initEvent(eventTypeArg: string, canBubbleArg: boolean, cancelableArg: boolean): void;
    preventDefault(): void;
    stopImmediatePropagation(): void;
    stopPropagation(): void;
    readonly AT_TARGET: number;
    readonly BUBBLING_PHASE: number;
    readonly CAPTURING_PHASE: number;
}

declare var Event: {
    prototype: Event;
    new(type: string, eventInitDict?: EventInit): Event;
    readonly AT_TARGET: number;
    readonly BUBBLING_PHASE: number;
    readonly CAPTURING_PHASE: number;
}

interface EventTarget {
    addEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
    dispatchEvent(evt: Event): boolean;
    removeEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var EventTarget: {
    prototype: EventTarget;
    new(): EventTarget;
}

interface File extends Blob {
    readonly lastModifiedDate: any;
    readonly name: string;
    readonly webkitRelativePath: string;
}

declare var File: {
    prototype: File;
    new (parts: (ArrayBuffer | ArrayBufferView | Blob | string)[], filename: string, properties?: FilePropertyBag): File;
}

interface FileList {
    readonly length: number;
    item(index: number): File;
    [index: number]: File;
}

declare var FileList: {
    prototype: FileList;
    new(): FileList;
}

interface FileReader extends EventTarget, MSBaseReader {
    readonly error: DOMError;
    readAsArrayBuffer(blob: Blob): void;
    readAsBinaryString(blob: Blob): void;
    readAsDataURL(blob: Blob): void;
    readAsText(blob: Blob, encoding?: string): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var FileReader: {
    prototype: FileReader;
    new(): FileReader;
}

interface IDBCursor {
    readonly direction: string;
    key: IDBKeyRange | IDBValidKey;
    readonly primaryKey: any;
    source: IDBObjectStore | IDBIndex;
    advance(count: number): void;
    continue(key?: IDBKeyRange | IDBValidKey): void;
    delete(): IDBRequest;
    update(value: any): IDBRequest;
    readonly NEXT: string;
    readonly NEXT_NO_DUPLICATE: string;
    readonly PREV: string;
    readonly PREV_NO_DUPLICATE: string;
}

declare var IDBCursor: {
    prototype: IDBCursor;
    new(): IDBCursor;
    readonly NEXT: string;
    readonly NEXT_NO_DUPLICATE: string;
    readonly PREV: string;
    readonly PREV_NO_DUPLICATE: string;
}

interface IDBCursorWithValue extends IDBCursor {
    readonly value: any;
}

declare var IDBCursorWithValue: {
    prototype: IDBCursorWithValue;
    new(): IDBCursorWithValue;
}

interface IDBDatabase extends EventTarget {
    readonly name: string;
    readonly objectStoreNames: DOMStringList;
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    version: number;
    onversionchange: (ev: IDBVersionChangeEvent) => any;
    close(): void;
    createObjectStore(name: string, optionalParameters?: IDBObjectStoreParameters): IDBObjectStore;
    deleteObjectStore(name: string): void;
    transaction(storeNames: string | string[], mode?: string): IDBTransaction;
    addEventListener(type: "versionchange", listener: (ev: IDBVersionChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBDatabase: {
    prototype: IDBDatabase;
    new(): IDBDatabase;
}

interface IDBFactory {
    cmp(first: any, second: any): number;
    deleteDatabase(name: string): IDBOpenDBRequest;
    open(name: string, version?: number): IDBOpenDBRequest;
}

declare var IDBFactory: {
    prototype: IDBFactory;
    new(): IDBFactory;
}

interface IDBIndex {
    keyPath: string | string[];
    readonly name: string;
    readonly objectStore: IDBObjectStore;
    readonly unique: boolean;
    multiEntry: boolean;
    count(key?: IDBKeyRange | IDBValidKey): IDBRequest;
    get(key: IDBKeyRange | IDBValidKey): IDBRequest;
    getKey(key: IDBKeyRange | IDBValidKey): IDBRequest;
    openCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
    openKeyCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
}

declare var IDBIndex: {
    prototype: IDBIndex;
    new(): IDBIndex;
}

interface IDBKeyRange {
    readonly lower: any;
    readonly lowerOpen: boolean;
    readonly upper: any;
    readonly upperOpen: boolean;
}

declare var IDBKeyRange: {
    prototype: IDBKeyRange;
    new(): IDBKeyRange;
    bound(lower: any, upper: any, lowerOpen?: boolean, upperOpen?: boolean): IDBKeyRange;
    lowerBound(lower: any, open?: boolean): IDBKeyRange;
    only(value: any): IDBKeyRange;
    upperBound(upper: any, open?: boolean): IDBKeyRange;
}

interface IDBObjectStore {
    readonly indexNames: DOMStringList;
    keyPath: string | string[];
    readonly name: string;
    readonly transaction: IDBTransaction;
    autoIncrement: boolean;
    add(value: any, key?: IDBKeyRange | IDBValidKey): IDBRequest;
    clear(): IDBRequest;
    count(key?: IDBKeyRange | IDBValidKey): IDBRequest;
    createIndex(name: string, keyPath: string | string[], optionalParameters?: IDBIndexParameters): IDBIndex;
    delete(key: IDBKeyRange | IDBValidKey): IDBRequest;
    deleteIndex(indexName: string): void;
    get(key: any): IDBRequest;
    index(name: string): IDBIndex;
    openCursor(range?: IDBKeyRange | IDBValidKey, direction?: string): IDBRequest;
    put(value: any, key?: IDBKeyRange | IDBValidKey): IDBRequest;
}

declare var IDBObjectStore: {
    prototype: IDBObjectStore;
    new(): IDBObjectStore;
}

interface IDBOpenDBRequest extends IDBRequest {
    onblocked: (this: this, ev: Event) => any;
    onupgradeneeded: (this: this, ev: IDBVersionChangeEvent) => any;
    addEventListener(type: "blocked", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "success", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "upgradeneeded", listener: (this: this, ev: IDBVersionChangeEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBOpenDBRequest: {
    prototype: IDBOpenDBRequest;
    new(): IDBOpenDBRequest;
}

interface IDBRequest extends EventTarget {
    readonly error: DOMError;
    onerror: (this: this, ev: ErrorEvent) => any;
    onsuccess: (this: this, ev: Event) => any;
    readonly readyState: string;
    readonly result: any;
    source: IDBObjectStore | IDBIndex | IDBCursor;
    readonly transaction: IDBTransaction;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "success", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBRequest: {
    prototype: IDBRequest;
    new(): IDBRequest;
}

interface IDBTransaction extends EventTarget {
    readonly db: IDBDatabase;
    readonly error: DOMError;
    readonly mode: string;
    onabort: (this: this, ev: Event) => any;
    oncomplete: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    abort(): void;
    objectStore(name: string): IDBObjectStore;
    readonly READ_ONLY: string;
    readonly READ_WRITE: string;
    readonly VERSION_CHANGE: string;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var IDBTransaction: {
    prototype: IDBTransaction;
    new(): IDBTransaction;
    readonly READ_ONLY: string;
    readonly READ_WRITE: string;
    readonly VERSION_CHANGE: string;
}

interface IDBVersionChangeEvent extends Event {
    readonly newVersion: number | null;
    readonly oldVersion: number;
}

declare var IDBVersionChangeEvent: {
    prototype: IDBVersionChangeEvent;
    new(): IDBVersionChangeEvent;
}

interface ImageData {
    data: Uint8ClampedArray;
    readonly height: number;
    readonly width: number;
}

declare var ImageData: {
    prototype: ImageData;
    new(width: number, height: number): ImageData;
    new(array: Uint8ClampedArray, width: number, height: number): ImageData;
}

interface MSApp {
    clearTemporaryWebDataAsync(): MSAppAsyncOperation;
    createBlobFromRandomAccessStream(type: string, seeker: any): Blob;
    createDataPackage(object: any): any;
    createDataPackageFromSelection(): any;
    createFileFromStorageFile(storageFile: any): File;
    createStreamFromInputStream(type: string, inputStream: any): MSStream;
    execAsyncAtPriority(asynchronousCallback: MSExecAtPriorityFunctionCallback, priority: string, ...args: any[]): void;
    execAtPriority(synchronousCallback: MSExecAtPriorityFunctionCallback, priority: string, ...args: any[]): any;
    getCurrentPriority(): string;
    getHtmlPrintDocumentSourceAsync(htmlDoc: any): PromiseLike<any>;
    getViewId(view: any): any;
    isTaskScheduledAtPriorityOrHigher(priority: string): boolean;
    pageHandlesAllApplicationActivations(enabled: boolean): void;
    suppressSubdownloadCredentialPrompts(suppress: boolean): void;
    terminateApp(exceptionObject: any): void;
    readonly CURRENT: string;
    readonly HIGH: string;
    readonly IDLE: string;
    readonly NORMAL: string;
}
declare var MSApp: MSApp;

interface MSAppAsyncOperation extends EventTarget {
    readonly error: DOMError;
    oncomplete: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    readonly readyState: number;
    readonly result: any;
    start(): void;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
    addEventListener(type: "complete", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSAppAsyncOperation: {
    prototype: MSAppAsyncOperation;
    new(): MSAppAsyncOperation;
    readonly COMPLETED: number;
    readonly ERROR: number;
    readonly STARTED: number;
}

interface MSBlobBuilder {
    append(data: any, endings?: string): void;
    getBlob(contentType?: string): Blob;
}

declare var MSBlobBuilder: {
    prototype: MSBlobBuilder;
    new(): MSBlobBuilder;
}

interface MSStream {
    readonly type: string;
    msClose(): void;
    msDetachStream(): any;
}

declare var MSStream: {
    prototype: MSStream;
    new(): MSStream;
}

interface MSStreamReader extends EventTarget, MSBaseReader {
    readonly error: DOMError;
    readAsArrayBuffer(stream: MSStream, size?: number): void;
    readAsBinaryString(stream: MSStream, size?: number): void;
    readAsBlob(stream: MSStream, size?: number): void;
    readAsDataURL(stream: MSStream, size?: number): void;
    readAsText(stream: MSStream, encoding?: string, size?: number): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MSStreamReader: {
    prototype: MSStreamReader;
    new(): MSStreamReader;
}

interface MediaQueryList {
    readonly matches: boolean;
    readonly media: string;
    addListener(listener: MediaQueryListListener): void;
    removeListener(listener: MediaQueryListListener): void;
}

declare var MediaQueryList: {
    prototype: MediaQueryList;
    new(): MediaQueryList;
}

interface MessageChannel {
    readonly port1: MessagePort;
    readonly port2: MessagePort;
}

declare var MessageChannel: {
    prototype: MessageChannel;
    new(): MessageChannel;
}

interface MessageEvent extends Event {
    readonly data: any;
    readonly origin: string;
    readonly ports: any;
    readonly source: any;
    initMessageEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, dataArg: any, originArg: string, lastEventIdArg: string, sourceArg: any): void;
}

declare var MessageEvent: {
    prototype: MessageEvent;
    new(type: string, eventInitDict?: MessageEventInit): MessageEvent;
}

interface MessagePort extends EventTarget {
    onmessage: (this: this, ev: MessageEvent) => any;
    close(): void;
    postMessage(message?: any, ports?: any): void;
    start(): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var MessagePort: {
    prototype: MessagePort;
    new(): MessagePort;
}

interface Position {
    readonly coords: Coordinates;
    readonly timestamp: number;
}

declare var Position: {
    prototype: Position;
    new(): Position;
}

interface PositionError {
    readonly code: number;
    readonly message: string;
    toString(): string;
    readonly PERMISSION_DENIED: number;
    readonly POSITION_UNAVAILABLE: number;
    readonly TIMEOUT: number;
}

declare var PositionError: {
    prototype: PositionError;
    new(): PositionError;
    readonly PERMISSION_DENIED: number;
    readonly POSITION_UNAVAILABLE: number;
    readonly TIMEOUT: number;
}

interface ProgressEvent extends Event {
    readonly lengthComputable: boolean;
    readonly loaded: number;
    readonly total: number;
    initProgressEvent(typeArg: string, canBubbleArg: boolean, cancelableArg: boolean, lengthComputableArg: boolean, loadedArg: number, totalArg: number): void;
}

declare var ProgressEvent: {
    prototype: ProgressEvent;
    new(type: string, eventInitDict?: ProgressEventInit): ProgressEvent;
}

interface WebSocket extends EventTarget {
    binaryType: string;
    readonly bufferedAmount: number;
    readonly extensions: string;
    onclose: (this: this, ev: CloseEvent) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onmessage: (this: this, ev: MessageEvent) => any;
    onopen: (this: this, ev: Event) => any;
    readonly protocol: string;
    readonly readyState: number;
    readonly url: string;
    close(code?: number, reason?: string): void;
    send(data: any): void;
    readonly CLOSED: number;
    readonly CLOSING: number;
    readonly CONNECTING: number;
    readonly OPEN: number;
    addEventListener(type: "close", listener: (this: this, ev: CloseEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "open", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var WebSocket: {
    prototype: WebSocket;
    new(url: string, protocols?: string | string[]): WebSocket;
    readonly CLOSED: number;
    readonly CLOSING: number;
    readonly CONNECTING: number;
    readonly OPEN: number;
}

interface Worker extends EventTarget, AbstractWorker {
    onmessage: (this: this, ev: MessageEvent) => any;
    postMessage(message: any, ports?: any): void;
    terminate(): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var Worker: {
    prototype: Worker;
    new(stringUrl: string): Worker;
}

interface XMLHttpRequest extends EventTarget, XMLHttpRequestEventTarget {
    onreadystatechange: (this: this, ev: ProgressEvent) => any;
    readonly readyState: number;
    readonly response: any;
    readonly responseText: string;
    responseType: string;
    readonly responseXML: any;
    readonly status: number;
    readonly statusText: string;
    timeout: number;
    readonly upload: XMLHttpRequestUpload;
    withCredentials: boolean;
    msCaching?: string;
    abort(): void;
    getAllResponseHeaders(): string;
    getResponseHeader(header: string): string | null;
    msCachingEnabled(): boolean;
    open(method: string, url: string, async?: boolean, user?: string, password?: string): void;
    overrideMimeType(mime: string): void;
    send(data?: string): void;
    send(data?: any): void;
    setRequestHeader(header: string, value: string): void;
    readonly DONE: number;
    readonly HEADERS_RECEIVED: number;
    readonly LOADING: number;
    readonly OPENED: number;
    readonly UNSENT: number;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "readystatechange", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "timeout", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var XMLHttpRequest: {
    prototype: XMLHttpRequest;
    new(): XMLHttpRequest;
    readonly DONE: number;
    readonly HEADERS_RECEIVED: number;
    readonly LOADING: number;
    readonly OPENED: number;
    readonly UNSENT: number;
    create(): XMLHttpRequest;
}

interface XMLHttpRequestUpload extends EventTarget, XMLHttpRequestEventTarget {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var XMLHttpRequestUpload: {
    prototype: XMLHttpRequestUpload;
    new(): XMLHttpRequestUpload;
}

interface AbstractWorker {
    onerror: (this: this, ev: ErrorEvent) => any;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface MSBaseReader {
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadend: (this: this, ev: ProgressEvent) => any;
    onloadstart: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    readonly readyState: number;
    readonly result: any;
    abort(): void;
    readonly DONE: number;
    readonly EMPTY: number;
    readonly LOADING: number;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface NavigatorID {
    readonly appName: string;
    readonly appVersion: string;
    readonly platform: string;
    readonly product: string;
    readonly productSub: string;
    readonly userAgent: string;
    readonly vendor: string;
    readonly vendorSub: string;
}

interface NavigatorOnLine {
    readonly onLine: boolean;
}

interface WindowBase64 {
    atob(encodedString: string): string;
    btoa(rawString: string): string;
}

interface WindowConsole {
    readonly console: Console;
}

interface XMLHttpRequestEventTarget {
    onabort: (this: this, ev: Event) => any;
    onerror: (this: this, ev: ErrorEvent) => any;
    onload: (this: this, ev: Event) => any;
    onloadend: (this: this, ev: ProgressEvent) => any;
    onloadstart: (this: this, ev: Event) => any;
    onprogress: (this: this, ev: ProgressEvent) => any;
    ontimeout: (this: this, ev: ProgressEvent) => any;
    addEventListener(type: "abort", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "load", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "loadend", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "loadstart", listener: (this: this, ev: Event) => any, useCapture?: boolean): void;
    addEventListener(type: "progress", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "timeout", listener: (this: this, ev: ProgressEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface FileReaderSync {
    readAsArrayBuffer(blob: Blob): any;
    readAsBinaryString(blob: Blob): void;
    readAsDataURL(blob: Blob): string;
    readAsText(blob: Blob, encoding?: string): string;
}

declare var FileReaderSync: {
    prototype: FileReaderSync;
    new(): FileReaderSync;
}

interface WorkerGlobalScope extends EventTarget, WorkerUtils, DedicatedWorkerGlobalScope, WindowConsole {
    readonly location: WorkerLocation;
    onerror: (this: this, ev: ErrorEvent) => any;
    readonly self: WorkerGlobalScope;
    close(): void;
    msWriteProfilerMark(profilerMarkName: string): void;
    toString(): string;
    addEventListener(type: "error", listener: (this: this, ev: ErrorEvent) => any, useCapture?: boolean): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var WorkerGlobalScope: {
    prototype: WorkerGlobalScope;
    new(): WorkerGlobalScope;
}

interface WorkerLocation {
    readonly hash: string;
    readonly host: string;
    readonly hostname: string;
    readonly href: string;
    readonly pathname: string;
    readonly port: string;
    readonly protocol: string;
    readonly search: string;
    toString(): string;
}

declare var WorkerLocation: {
    prototype: WorkerLocation;
    new(): WorkerLocation;
}

interface WorkerNavigator extends Object, NavigatorID, NavigatorOnLine {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

declare var WorkerNavigator: {
    prototype: WorkerNavigator;
    new(): WorkerNavigator;
}

interface DedicatedWorkerGlobalScope {
    onmessage: (this: this, ev: MessageEvent) => any;
    postMessage(data: any): void;
    addEventListener(type: "message", listener: (this: this, ev: MessageEvent) => any, useCapture?: boolean): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
}

interface WorkerUtils extends Object, WindowBase64 {
    readonly indexedDB: IDBFactory;
    readonly msIndexedDB: IDBFactory;
    readonly navigator: WorkerNavigator;
    clearImmediate(handle: number): void;
    clearInterval(handle: number): void;
    clearTimeout(handle: number): void;
    importScripts(...urls: string[]): void;
    setImmediate(handler: (...args: any[]) => void): number;
    setImmediate(handler: any, ...args: any[]): number;
    setInterval(handler: (...args: any[]) => void, timeout: number): number;
    setInterval(handler: any, timeout?: any, ...args: any[]): number;
    setTimeout(handler: (...args: any[]) => void, timeout: number): number;
    setTimeout(handler: any, timeout?: any, ...args: any[]): number;
}

interface BlobPropertyBag {
    type?: string;
    endings?: string;
}

interface FilePropertyBag {
    type?: string;
    lastModified?: number;
}

interface EventListenerObject {
    handleEvent(evt: Event): void;
}

interface MessageEventInit extends EventInit {
    data?: any;
    origin?: string;
    lastEventId?: string;
    channel?: string;
    source?: any;
    ports?: MessagePort[];
}

interface ProgressEventInit extends EventInit {
    lengthComputable?: boolean;
    loaded?: number;
    total?: number;
}

interface IDBArrayKey extends Array<IDBValidKey> {
}

interface RsaKeyGenParams extends Algorithm {
    modulusLength: number;
    publicExponent: Uint8Array;
}

interface RsaHashedKeyGenParams extends RsaKeyGenParams {
    hash: AlgorithmIdentifier;
}

interface RsaKeyAlgorithm extends KeyAlgorithm {
    modulusLength: number;
    publicExponent: Uint8Array;
}

interface RsaHashedKeyAlgorithm extends RsaKeyAlgorithm {
    hash: AlgorithmIdentifier;
}

interface RsaHashedImportParams {
    hash: AlgorithmIdentifier;
}

interface RsaPssParams {
    saltLength: number;
}

interface RsaOaepParams extends Algorithm {
    label?: BufferSource;
}

interface EcdsaParams extends Algorithm {
    hash: AlgorithmIdentifier;
}

interface EcKeyGenParams extends Algorithm {
    namedCurve: string;
}

interface EcKeyAlgorithm extends KeyAlgorithm {
    typedCurve: string;
}

interface EcKeyImportParams {
    namedCurve: string;
}

interface EcdhKeyDeriveParams extends Algorithm {
    public: CryptoKey;
}

interface AesCtrParams extends Algorithm {
    counter: BufferSource;
    length: number;
}

interface AesKeyAlgorithm extends KeyAlgorithm {
    length: number;
}

interface AesKeyGenParams extends Algorithm {
    length: number;
}

interface AesDerivedKeyParams extends Algorithm {
    length: number;
}

interface AesCbcParams extends Algorithm {
    iv: BufferSource;
}

interface AesCmacParams extends Algorithm {
    length: number;
}

interface AesGcmParams extends Algorithm {
    iv: BufferSource;
    additionalData?: BufferSource;
    tagLength?: number;
}

interface AesCfbParams extends Algorithm {
    iv: BufferSource;
}

interface HmacImportParams extends Algorithm {
    hash?: AlgorithmIdentifier;
    length?: number;
}

interface HmacKeyAlgorithm extends KeyAlgorithm {
    hash: AlgorithmIdentifier;
    length: number;
}

interface HmacKeyGenParams extends Algorithm {
    hash: AlgorithmIdentifier;
    length?: number;
}

interface DhKeyGenParams extends Algorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface DhKeyAlgorithm extends KeyAlgorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface DhKeyDeriveParams extends Algorithm {
    public: CryptoKey;
}

interface DhImportKeyParams extends Algorithm {
    prime: Uint8Array;
    generator: Uint8Array;
}

interface ConcatParams extends Algorithm {
    hash?: AlgorithmIdentifier;
    algorithmId: Uint8Array;
    partyUInfo: Uint8Array;
    partyVInfo: Uint8Array;
    publicInfo?: Uint8Array;
    privateInfo?: Uint8Array;
}

interface HkdfCtrParams extends Algorithm {
    hash: AlgorithmIdentifier;
    label: BufferSource;
    context: BufferSource;
}

interface Pbkdf2Params extends Algorithm {
    salt: BufferSource;
    iterations: number;
    hash: AlgorithmIdentifier;
}

interface RsaOtherPrimesInfo {
    r: string;
    d: string;
    t: string;
}

interface JsonWebKey {
    kty: string;
    use?: string;
    key_ops?: string[];
    alg?: string;
    kid?: string;
    x5u?: string;
    x5c?: string;
    x5t?: string;
    ext?: boolean;
    crv?: string;
    x?: string;
    y?: string;
    d?: string;
    n?: string;
    e?: string;
    p?: string;
    q?: string;
    dp?: string;
    dq?: string;
    qi?: string;
    oth?: RsaOtherPrimesInfo[];
    k?: string;
}

declare type EventListenerOrEventListenerObject = EventListener | EventListenerObject;

interface ErrorEventHandler {
    (message: string, filename?: string, lineno?: number, colno?: number, error?:Error): void;
}
interface PositionCallback {
    (position: Position): void;
}
interface PositionErrorCallback {
    (error: PositionError): void;
}
interface MediaQueryListListener {
    (mql: MediaQueryList): void;
}
interface MSLaunchUriCallback {
    (): void;
}
interface MSUnsafeFunctionCallback {
    (): any;
}
interface MSExecAtPriorityFunctionCallback {
    (...args: any[]): any;
}
interface DecodeSuccessCallback {
    (decodedData: AudioBuffer): void;
}
interface DecodeErrorCallback {
    (error: DOMException): void;
}
interface FunctionStringCallback {
    (data: string): void;
}
declare var location: WorkerLocation;
declare var onerror: (this: WorkerGlobalScope, ev: ErrorEvent) => any;
declare var self: WorkerGlobalScope;
declare function close(): void;
declare function msWriteProfilerMark(profilerMarkName: string): void;
declare function toString(): string;
declare function addEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
declare function dispatchEvent(evt: Event): boolean;
declare function removeEventListener(type: string, listener?: EventListenerOrEventListenerObject, useCapture?: boolean): void;
declare var indexedDB: IDBFactory;
declare var msIndexedDB: IDBFactory;
declare var navigator: WorkerNavigator;
declare function clearImmediate(handle: number): void;
declare function clearInterval(handle: number): void;
declare function clearTimeout(handle: number): void;
declare function importScripts(...urls: string[]): void;
declare function setImmediate(handler: (...args: any[]) => void): number;
declare function setImmediate(handler: any, ...args: any[]): number;
declare function setInterval(handler: (...args: any[]) => void, timeout: number): number;
declare function setInterval(handler: any, timeout?: any, ...args: any[]): number;
declare function setTimeout(handler: (...args: any[]) => void, timeout: number): number;
declare function setTimeout(handler: any, timeout?: any, ...args: any[]): number;
declare function atob(encodedString: string): string;
declare function btoa(rawString: string): string;
declare var onmessage: (this: WorkerGlobalScope, ev: MessageEvent) => any;
declare function postMessage(data: any): void;
declare var console: Console;
declare function addEventListener(type: "error", listener: (this: WorkerGlobalScope, ev: ErrorEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: "message", listener: (this: WorkerGlobalScope, ev: MessageEvent) => any, useCapture?: boolean): void;
declare function addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
type AlgorithmIdentifier = string | Algorithm;
type IDBKeyPath = string;
type IDBValidKey = number | string | Date | IDBArrayKey;
type BufferSource = ArrayBuffer | ArrayBufferView;