import type { MemoryVolume } from './memory-volume.d.ts';
import type { IScriptEngine, ExecutionOutcome, SpawnEngineConfig, EngineConfig } from './engine-types.d.ts';
import type { ProcessManager } from './threading/process-manager.js';
export declare function spawnEngine(vol: MemoryVolume, config?: SpawnEngineConfig): Promise<IScriptEngine>;
declare class ProcessWorkerAdapter implements IScriptEngine {
    private _vol;
    private _processManager;
    private _vfsBridge;
    private _cfg;
    constructor(vol: MemoryVolume, cfg?: EngineConfig);
    execute(code: string, filename?: string): Promise<ExecutionOutcome>;
    runFile(filename: string): Promise<ExecutionOutcome>;
    private _runInWorker;
    clearCache(): void;
    getVolume(): MemoryVolume;
    getProcessManager(): ProcessManager;
    teardown(): void;
}
export declare function spawnProcessWorkerEngine(vol: MemoryVolume, config?: EngineConfig): Promise<ProcessWorkerAdapter>;
export type { ScriptEngine } from './script-engine.js';
export type { WorkerSandbox } from './worker-sandbox.d.ts';
export type { IframeSandbox } from './iframe-sandbox.d.ts';
export { ProcessWorkerAdapter };
export type { IScriptEngine, ExecutionOutcome, EngineConfig, SpawnEngineConfig, VolumeSnapshot } from './engine-types.d.ts';
