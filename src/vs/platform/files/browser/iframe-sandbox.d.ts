import type { MemoryVolume } from './memory-volume.d.ts';
import type { IScriptEngine, ExecutionOutcome, EngineConfig } from './engine-types.d.ts';
export declare class IframeSandbox implements IScriptEngine {
    private frame;
    private targetOrigin;
    private vol;
    private cfg;
    private ready;
    private pendingCalls;
    private nextId;
    private onFileChange;
    private onFileDelete;
    private onMessage;
    constructor(sandboxUrl: string, vol: MemoryVolume, cfg?: EngineConfig);
    private bindMessageHandler;
    private awaitReady;
    private sendInit;
    private attachVolumeSync;
    private dispatch;
    execute(code: string, filename?: string): Promise<ExecutionOutcome>;
    runFile(filename: string): Promise<ExecutionOutcome>;
    clearCache(): void;
    getVolume(): MemoryVolume;
    terminate(): void;
}
