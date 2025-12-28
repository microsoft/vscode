/**
 * Child Process Mock
 * Provides mock implementations for process spawning tests
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

export interface MockChildProcess extends EventEmitter {
    stdin: MockWritable;
    stdout: MockReadable;
    stderr: MockReadable;
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
}

export interface MockWritable {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
}

export interface MockReadable extends EventEmitter {
    setEncoding: ReturnType<typeof vi.fn>;
}

export function createMockChildProcess(): MockChildProcess {
    const process = new EventEmitter() as MockChildProcess;

    process.stdin = {
        write: vi.fn((data: string, callback?: () => void) => {
            callback?.();
            return true;
        }),
        end: vi.fn()
    };

    const stdout = new EventEmitter() as MockReadable;
    stdout.setEncoding = vi.fn();
    process.stdout = stdout;

    const stderr = new EventEmitter() as MockReadable;
    stderr.setEncoding = vi.fn();
    process.stderr = stderr;

    process.pid = Math.floor(Math.random() * 10000) + 1000;
    process.killed = false;
    process.kill = vi.fn(() => {
        process.killed = true;
        process.emit('exit', 0, null);
        return true;
    });

    return process;
}

export function createMockSpawn() {
    const mockProcess = createMockChildProcess();

    const spawn = vi.fn(() => mockProcess);

    return {
        spawn,
        mockProcess,
        simulateOutput: (data: string) => {
            mockProcess.stdout.emit('data', Buffer.from(data));
        },
        simulateError: (data: string) => {
            mockProcess.stderr.emit('data', Buffer.from(data));
        },
        simulateExit: (code: number) => {
            mockProcess.emit('exit', code, null);
        },
        simulateSpawnError: (error: Error) => {
            mockProcess.emit('error', error);
        }
    };
}

export function resetChildProcessMocks() {
    vi.clearAllMocks();
}
