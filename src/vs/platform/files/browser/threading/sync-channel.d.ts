export declare const SLOT_SIZE = 4096;
export declare const MAX_SLOTS = 64;
export declare class SyncChannelController {
    private _buffer;
    private _int32;
    private _uint8;
    constructor(bufferSize?: number);
    get buffer(): SharedArrayBuffer;
    writeResult(syncSlot: number, exitCode: number, stdout: string): void;
    writeError(syncSlot: number, exitCode: number, errorMessage: string): void;
}
export declare class SyncChannelWorker {
    private _int32;
    private _uint8;
    constructor(buffer: SharedArrayBuffer);
    allocateSlot(): number;
    waitForResult(syncSlot: number, timeoutMs?: number): {
        exitCode: number;
        stdout: string;
    };
}
