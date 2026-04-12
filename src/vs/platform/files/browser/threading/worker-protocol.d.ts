export interface VFSBinarySnapshot {
    manifest: VFSSnapshotEntry[];
    data: ArrayBuffer;
}
export interface VFSSnapshotEntry {
    path: string;
    offset: number;
    length: number;
    isDirectory: boolean;
}
export interface MainToWorker_Init {
    type: "init";
    pid: number;
    cwd: string;
    env: Record<string, string>;
    snapshot: VFSBinarySnapshot;
    sharedBuffer?: SharedArrayBuffer;
    syncBuffer?: SharedArrayBuffer;
}
export interface MainToWorker_Exec {
    type: "exec";
    filePath: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    isShell?: boolean;
    shellCommand?: string;
    isFork?: boolean;
    persistent?: boolean;
    isWorkerThread?: boolean;
    workerData?: unknown;
    threadId?: number;
}
export interface MainToWorker_Stdin {
    type: "stdin";
    data: string;
}
export interface MainToWorker_Signal {
    type: "signal";
    signal: string;
}
export interface MainToWorker_Resize {
    type: "resize";
    cols: number;
    rows: number;
}
export interface MainToWorker_VFSSync {
    type: "vfs-sync";
    path: string;
    content: ArrayBuffer | null;
    isDirectory: boolean;
}
export interface MainToWorker_VFSChunk {
    type: "vfs-chunk";
    chunkIndex: number;
    totalChunks: number;
    data: ArrayBuffer;
    manifest: VFSSnapshotEntry[];
}
export interface MainToWorker_SpawnResult {
    type: "spawn-result";
    requestId: number;
    pid: number;
    error?: string;
}
export interface MainToWorker_ChildOutput {
    type: "child-output";
    requestId: number;
    stream: "stdout" | "stderr";
    data: string;
}
export interface MainToWorker_ChildExit {
    type: "child-exit";
    requestId: number;
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface MainToWorker_HttpRequest {
    type: "http-request";
    requestId: number;
    port: number;
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | null;
}
export interface MainToWorker_IPC {
    type: "ipc-message";
    data: unknown;
    targetRequestId?: number;
}
export interface MainToWorker_WsUpgrade {
    type: "ws-upgrade";
    uid: string;
    port: number;
    path: string;
    headers: Record<string, string>;
}
export interface MainToWorker_WsData {
    type: "ws-data";
    uid: string;
    frame: number[];
}
export interface MainToWorker_WsClose {
    type: "ws-close";
    uid: string;
    code: number;
}
export type MainToWorkerMessage = MainToWorker_Init | MainToWorker_Exec | MainToWorker_Stdin | MainToWorker_Signal | MainToWorker_Resize | MainToWorker_VFSSync | MainToWorker_VFSChunk | MainToWorker_SpawnResult | MainToWorker_ChildOutput | MainToWorker_ChildExit | MainToWorker_HttpRequest | MainToWorker_IPC | MainToWorker_WsUpgrade | MainToWorker_WsData | MainToWorker_WsClose;
export interface WorkerToMain_Ready {
    type: "ready";
    pid: number;
}
export interface WorkerToMain_Stdout {
    type: "stdout";
    data: string;
}
export interface WorkerToMain_Stderr {
    type: "stderr";
    data: string;
}
export interface WorkerToMain_Exit {
    type: "exit";
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface WorkerToMain_Console {
    type: "console";
    method: string;
    args: string[];
}
export interface WorkerToMain_VFSWrite {
    type: "vfs-write";
    path: string;
    content: ArrayBuffer;
    isDirectory: boolean;
}
export interface WorkerToMain_VFSDelete {
    type: "vfs-delete";
    path: string;
}
export interface WorkerToMain_VFSRead {
    type: "vfs-read";
    requestId: number;
    path: string;
}
export interface WorkerToMain_SpawnRequest {
    type: "spawn-request";
    requestId: number;
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    stdio: "pipe" | "inherit";
}
export interface WorkerToMain_ForkRequest {
    type: "fork-request";
    requestId: number;
    modulePath: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
}
export interface WorkerToMain_WorkerThreadRequest {
    type: "workerthread-request";
    requestId: number;
    modulePath: string;
    isEval?: boolean;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    workerData: unknown;
    threadId: number;
}
export interface WorkerToMain_SpawnSync {
    type: "spawn-sync";
    requestId: number;
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    syncSlot: number;
    shellCommand?: string;
}
export interface WorkerToMain_ServerListen {
    type: "server-listen";
    port: number;
    hostname: string;
}
export interface WorkerToMain_ServerClose {
    type: "server-close";
    port: number;
}
export interface WorkerToMain_HttpRequest {
    type: "http-request";
    requestId: number;
    port: number;
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | null;
}
export interface WorkerToMain_CwdChange {
    type: "cwd-change";
    cwd: string;
}
export interface WorkerToMain_StdinRawStatus {
    type: "stdin-raw-status";
    isRaw: boolean;
}
export interface WorkerToMain_HttpResponse {
    type: "http-response";
    requestId: number;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: string | ArrayBuffer;
}
export interface WorkerToMain_IPC {
    type: "ipc-message";
    data: unknown;
    targetRequestId?: number;
}
export interface WorkerToMain_ShellDone {
    type: "shell-done";
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface WorkerToMain_Error {
    type: "error";
    message: string;
    stack?: string;
}
export interface WorkerToMain_WsFrame {
    type: "ws-frame";
    uid: string;
    kind: string;
    data?: string;
    bytes?: number[];
    code?: number;
    message?: string;
}
export type WorkerToMainMessage = WorkerToMain_Ready | WorkerToMain_Stdout | WorkerToMain_Stderr | WorkerToMain_Exit | WorkerToMain_Console | WorkerToMain_VFSWrite | WorkerToMain_VFSDelete | WorkerToMain_VFSRead | WorkerToMain_SpawnRequest | WorkerToMain_ForkRequest | WorkerToMain_WorkerThreadRequest | WorkerToMain_SpawnSync | WorkerToMain_ServerListen | WorkerToMain_ServerClose | WorkerToMain_HttpRequest | WorkerToMain_CwdChange | WorkerToMain_StdinRawStatus | WorkerToMain_HttpResponse | WorkerToMain_IPC | WorkerToMain_ShellDone | WorkerToMain_Error | WorkerToMain_WsFrame;
export interface SpawnConfig {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
    snapshot: VFSBinarySnapshot;
    sharedBuffer?: SharedArrayBuffer;
    syncBuffer?: SharedArrayBuffer;
    parentPid?: number;
}
export interface ProcessInfo {
    pid: number;
    command: string;
    args: string[];
    state: "starting" | "running" | "exited";
    exitCode?: number;
    parentPid?: number;
}
