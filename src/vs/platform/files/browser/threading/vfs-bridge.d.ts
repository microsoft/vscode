import type { MemoryVolume } from "../memory-volume.d.ts";
import type { VFSBinarySnapshot, VFSSnapshotEntry } from "./worker-protocol.d.ts";
import type { SharedVFSController } from "./shared-vfs.d.ts";
export declare class VFSBridge {
    private _volume;
    private _broadcaster;
    private _sharedVFS;
    private _suppressWatch;
    constructor(volume: MemoryVolume);
    setBroadcaster(fn: (path: string, content: ArrayBuffer | null, excludePid: number) => void): void;
    setSharedVFS(controller: SharedVFSController): void;
    createSnapshot(): VFSBinarySnapshot;
    createChunkedSnapshots(): {
        chunkIndex: number;
        totalChunks: number;
        data: ArrayBuffer;
        manifest: VFSSnapshotEntry[];
    }[];
    handleWorkerWrite(path: string, content: Uint8Array): void;
    handleWorkerMkdir(path: string): void;
    handleWorkerDelete(path: string): void;
    broadcastChange(path: string, content: ArrayBuffer | null, excludePid: number): void;
    watch(): () => void;
    private _walkVolume;
}
