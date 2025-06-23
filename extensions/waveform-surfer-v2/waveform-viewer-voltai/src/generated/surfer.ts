// Generated WIT bindings placeholder
// This file will be replaced by the actual generated bindings from wit2ts

export interface FileMetadata {
    format: string;
    version: string;
    date: string;
    timescale: string;
    totalSignals: number;
    totalScopes: number;
    timeRange: Timerange;
}

export interface HierarchyNode {
    id: number;
    name: string;
    nodeType: string;
    parentId?: number;
    children: number[];
    signalInfo?: SignalInfo;
}

export interface SignalInfo {
    id: number;
    name: string;
    width: number;
    signalType: string;
    encoding: string;
    msb: number;
    lsb: number;
}

export interface SignalData {
    signalId: number;
    transitions: Transition[];
    minTime: bigint;
    maxTime: bigint;
}

export interface Transition {
    time: bigint;
    value: string;
}

export interface Timerange {
    start: bigint;
    end: bigint;
    timescale: string;
}

export enum ParseError {
    InvalidFormat = "invalid-format",
    FileNotFound = "file-not-found",
    PermissionDenied = "permission-denied",
    CorruptedData = "corrupted-data",
    UnsupportedVersion = "unsupported-version",
    MemoryError = "memory-error",
    UnknownError = "unknown-error"
}

export type ParseResult =
    | { tag: "ok"; val: FileMetadata }
    | { tag: "err"; val: ParseError };

// Placeholder for WASM instance
export interface SurferParserInstance {
    parseFile(fileSize: bigint, formatHint?: string): ParseResult;
    getHierarchyChildren(parentId?: number): HierarchyNode[];
    getSignalData(signalIds: number[], timeStart?: bigint, timeEnd?: bigint): void;
    getSignalValueAtTime(signalId: number, time: bigint): string | undefined;
    getTimeRange(): Timerange | undefined;
    cleanup(): void;
}

// Placeholder imports interface
export interface SurferParserImports {
    fsRead(offset: bigint, length: number): Uint8Array;
    logMessage(level: string, message: string): void;
    progressUpdate(percent: number, message: string): void;
    hierarchyNodeDiscovered(node: HierarchyNode): void;
    metadataReady(metadata: FileMetadata): void;
    signalDataChunk(data: SignalData, chunkIndex: number, totalChunks: number): void;
}

// Export instantiation function placeholder
export async function instantiate(
    module: WebAssembly.Module,
    imports: SurferParserImports
): Promise<SurferParserInstance> {
    // This will be implemented by the actual generated bindings
    throw new Error("WIT bindings not yet generated. Run 'npm run generate:bindings' first.");
}