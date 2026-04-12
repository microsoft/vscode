export declare function isSharedArrayBufferAvailable(): boolean;
export declare class SharedVFSController {
    private _buffer;
    private _view;
    private _int32;
    private _uint8;
    private _pathEncoder;
    private _pathDecoder;
    constructor(bufferSize?: number);
    get buffer(): SharedArrayBuffer;
    writeFile(path: string, content: Uint8Array): boolean;
    writeDirectory(path: string): boolean;
    deleteFile(path: string): boolean;
    readFile(path: string): Uint8Array | null;
    exists(path: string): boolean;
    get version(): number;
    private _findEntry;
    private _updateEntry;
    private _lock;
    private _unlock;
}
export declare class SharedVFSReader {
    private _buffer;
    private _view;
    private _int32;
    private _uint8;
    private _pathEncoder;
    private _pathDecoder;
    constructor(buffer: SharedArrayBuffer);
    readFileSync(path: string): Uint8Array | null;
    existsSync(path: string): boolean;
    isDirectorySync(path: string): boolean;
    get version(): number;
    waitForChange(currentVersion: number, timeoutMs?: number): number;
    private _findEntry;
}
