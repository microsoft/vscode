/**
 * Process Manager
 * Manages CLI process lifecycle including spawn, stdin/stdout, and termination
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter, Disposable } from 'vscode';
import type { ProcessState, CLIOutput, ProcessOptions, SpawnResult } from '../../types';

/**
 * Default process options
 */
const DEFAULT_OPTIONS: ProcessOptions = {
    timeout: 300000 // 5 minutes
};

/**
 * ProcessManager class
 * Handles spawning and managing CLI processes
 */
export class ProcessManager implements Disposable {
    private process: ChildProcess | null = null;
    private _state: ProcessState = 'idle';
    private _pid: number | null = null;

    private readonly _onOutput = new EventEmitter<CLIOutput>();
    private readonly _onStateChange = new EventEmitter<ProcessState>();
    private readonly _onError = new EventEmitter<Error>();
    private readonly _onExit = new EventEmitter<number | null>();

    /** Event fired when process outputs data */
    readonly onOutput = this._onOutput.event;

    /** Event fired when process state changes */
    readonly onStateChange = this._onStateChange.event;

    /** Event fired when an error occurs */
    readonly onError = this._onError.event;

    /** Event fired when process exits */
    readonly onExit = this._onExit.event;

    /** Current process state */
    get state(): ProcessState {
        return this._state;
    }

    /** Process ID if running */
    get pid(): number | null {
        return this._pid;
    }

    /** Whether a process is currently running */
    get isRunning(): boolean {
        return this._state === 'running';
    }

    /**
     * Spawn a new process
     * @param command Command to execute
     * @param args Command arguments
     * @param options Process options
     */
    async spawn(
        command: string,
        args: string[] = [],
        options: ProcessOptions = {}
    ): Promise<SpawnResult> {
        if (this.isRunning) {
            throw new Error('Process already running. Kill it first.');
        }

        const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

        this.setState('starting');

        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(command, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: true,
                    cwd: mergedOptions.cwd,
                    env: { ...process.env, ...mergedOptions.env }
                });

                if (!this.process.pid) {
                    this.setState('error');
                    reject(new Error('Failed to spawn process'));
                    return;
                }

                this._pid = this.process.pid;
                this.setupProcessHandlers();
                this.setState('running');

                resolve({
                    pid: this._pid,
                    success: true
                });

                // Setup timeout if specified
                if (mergedOptions.timeout) {
                    setTimeout(() => {
                        if (this.isRunning) {
                            this.kill();
                        }
                    }, mergedOptions.timeout);
                }
            } catch (error) {
                this.setState('error');
                reject(error);
            }
        });
    }

    /**
     * Write data to process stdin
     * @param data Data to write
     */
    write(data: string): boolean {
        if (!this.process?.stdin || !this.isRunning) {
            return false;
        }

        try {
            this.process.stdin.write(data);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Write data with newline to process stdin
     * @param data Data to write
     */
    writeLine(data: string): boolean {
        return this.write(data + '\n');
    }

    /**
     * Kill the running process
     */
    async kill(): Promise<void> {
        if (!this.process || this._state === 'idle') {
            return;
        }

        this.setState('stopping');

        return new Promise((resolve) => {
            if (!this.process) {
                this.setState('idle');
                resolve();
                return;
            }

            // Force kill after timeout
            const killTimeout = setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.process.kill('SIGKILL');
                }
            }, 5000);

            this.process.once('exit', () => {
                clearTimeout(killTimeout);
                this.cleanup();
                resolve();
            });

            // Try graceful kill first
            this.process.kill('SIGTERM');
        });
    }

    /**
     * Dispose of the process manager
     */
    dispose(): void {
        if (this.isRunning) {
            this.process?.kill('SIGKILL');
        }
        this.cleanup();
        this._onOutput.dispose();
        this._onStateChange.dispose();
        this._onError.dispose();
        this._onExit.dispose();
    }

    /**
     * Setup process event handlers
     */
    private setupProcessHandlers(): void {
        if (!this.process) return;

        // Handle stdout
        this.process.stdout?.on('data', (data: Buffer) => {
            this._onOutput.fire({
                type: 'stdout',
                data: data.toString(),
                timestamp: Date.now()
            });
        });

        // Handle stderr
        this.process.stderr?.on('data', (data: Buffer) => {
            this._onOutput.fire({
                type: 'stderr',
                data: data.toString(),
                timestamp: Date.now()
            });
        });

        // Handle process error
        this.process.on('error', (error: Error) => {
            this.setState('error');
            this._onError.fire(error);
        });

        // Handle process exit
        this.process.on('exit', (code: number | null) => {
            this._onExit.fire(code);
            this.cleanup();
        });

        // Handle process close
        this.process.on('close', () => {
            this.cleanup();
        });
    }

    /**
     * Update process state
     */
    private setState(state: ProcessState): void {
        if (this._state !== state) {
            this._state = state;
            this._onStateChange.fire(state);
        }
    }

    /**
     * Cleanup after process ends
     */
    private cleanup(): void {
        this.process = null;
        this._pid = null;
        this.setState('idle');
    }
}
