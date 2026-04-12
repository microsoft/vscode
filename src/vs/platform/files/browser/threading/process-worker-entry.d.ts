export declare function forkChild(modulePath: string, args: string[], opts: {
    cwd: string;
    env: Record<string, string>;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onIPC?: (data: unknown) => void;
    onExit?: (exitCode: number) => void;
}): {
    sendIPC: (data: unknown) => void;
    disconnect: () => void;
    requestId: number;
};
export declare function spawnChild(command: string, args: string[], opts?: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: "pipe" | "inherit";
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
}): Promise<{
    pid: number;
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
