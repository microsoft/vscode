import type { MemoryVolume } from './memory-volume.d.ts';
export interface EngineConfig {
    cwd?: string;
    env?: Record<string, string>;
    onConsole?: (method: string, args: unknown[]) => void;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}
export interface LoadedModule {
    id: string;
    filename: string;
    exports: unknown;
    loaded: boolean;
    children: LoadedModule[];
    paths: string[];
}
export interface ExecutionOutcome {
    exports: unknown;
    module: LoadedModule;
}
export interface IScriptEngine {
    execute(code: string, filename?: string): Promise<ExecutionOutcome>;
    runFile(filename: string): Promise<ExecutionOutcome>;
    clearCache(): void;
    getVolume?(): MemoryVolume;
    terminate?(): void;
}
export interface SpawnEngineConfig extends EngineConfig {
    sandboxUrl?: string;
    allowUnsafeEval?: boolean;
    useWorker?: boolean | 'auto';
}
export interface VolumeSnapshot {
    entries: VolumeEntry[];
}
export interface VolumeEntry {
    path: string;
    kind: 'file' | 'directory';
    data?: string;
}
