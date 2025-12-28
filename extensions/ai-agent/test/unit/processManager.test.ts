/**
 * ProcessManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../../src/domain/orchestrator/processManager';
import type { CLIOutput, ProcessState } from '../../src/types';

// Mock child_process
vi.mock('child_process', () => {
    const EventEmitter = require('events');

    const createMockProcess = () => {
        const proc = new EventEmitter();
        proc.stdin = {
            write: vi.fn(() => true),
            end: vi.fn()
        };
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.pid = 12345;
        proc.killed = false;
        proc.kill = vi.fn((signal?: string) => {
            proc.killed = true;
            setTimeout(() => proc.emit('exit', 0), 10);
            return true;
        });
        return proc;
    };

    let mockProcess = createMockProcess();

    return {
        spawn: vi.fn(() => {
            mockProcess = createMockProcess();
            return mockProcess;
        }),
        __getMockProcess: () => mockProcess,
        __resetMockProcess: () => {
            mockProcess = createMockProcess();
        }
    };
});

describe('ProcessManager', () => {
    let manager: ProcessManager;

    beforeEach(() => {
        manager = new ProcessManager();
        vi.clearAllMocks();
    });

    afterEach(() => {
        manager.dispose();
    });

    describe('spawn', () => {
        it('should spawn a process and return SpawnResult', async () => {
            const result = await manager.spawn('echo', ['hello']);

            expect(result).toEqual({
                pid: 12345,
                success: true
            });
            expect(manager.isRunning).toBe(true);
            expect(manager.pid).toBe(12345);
        });

        it('should emit state changes during spawn', async () => {
            const states: ProcessState[] = [];
            manager.onStateChange((state) => states.push(state));

            await manager.spawn('echo', ['hello']);

            expect(states).toContain('starting');
            expect(states).toContain('running');
        });

        it('should throw error if process already running', async () => {
            await manager.spawn('echo', ['hello']);

            await expect(manager.spawn('echo', ['world'])).rejects.toThrow(
                'Process already running'
            );
        });

        it('should use provided options', async () => {
            const { spawn } = await import('child_process');

            await manager.spawn('echo', ['hello'], {
                cwd: '/test/dir',
                env: { TEST_VAR: 'test' }
            });

            expect(spawn).toHaveBeenCalledWith(
                'echo',
                ['hello'],
                expect.objectContaining({
                    cwd: '/test/dir'
                })
            );
        });
    });

    describe('write', () => {
        it('should write to stdin when process is running', async () => {
            await manager.spawn('node', ['-i']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            const result = manager.write('test input');

            expect(result).toBe(true);
            expect(mockProcess.stdin.write).toHaveBeenCalledWith('test input');
        });

        it('should return false when no process running', () => {
            const result = manager.write('test input');

            expect(result).toBe(false);
        });

        it('should write line with newline appended', async () => {
            await manager.spawn('node', ['-i']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            manager.writeLine('test input');

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('test input\n');
        });
    });

    describe('output events', () => {
        it('should emit stdout output events', async () => {
            const outputs: CLIOutput[] = [];
            manager.onOutput((output) => outputs.push(output));

            await manager.spawn('echo', ['hello']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.stdout.emit('data', Buffer.from('Hello World'));

            expect(outputs).toHaveLength(1);
            expect(outputs[0]).toEqual({
                type: 'stdout',
                data: 'Hello World',
                timestamp: expect.any(Number)
            });
        });

        it('should emit stderr output events', async () => {
            const outputs: CLIOutput[] = [];
            manager.onOutput((output) => outputs.push(output));

            await manager.spawn('echo', ['hello']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.stderr.emit('data', Buffer.from('Error message'));

            expect(outputs).toHaveLength(1);
            expect(outputs[0]).toEqual({
                type: 'stderr',
                data: 'Error message',
                timestamp: expect.any(Number)
            });
        });
    });

    describe('kill', () => {
        it('should kill process cleanly', async () => {
            await manager.spawn('node', ['-i']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            await manager.kill();

            expect(mockProcess.kill).toHaveBeenCalled();
            expect(manager.isRunning).toBe(false);
            expect(manager.state).toBe('idle');
        });

        it('should do nothing if no process running', async () => {
            await manager.kill();

            expect(manager.state).toBe('idle');
        });

        it('should emit stopping state', async () => {
            const states: ProcessState[] = [];
            manager.onStateChange((state) => states.push(state));

            await manager.spawn('node', ['-i']);
            await manager.kill();

            expect(states).toContain('stopping');
        });

        it('should emit exit event', async () => {
            const exitCodes: (number | null)[] = [];
            manager.onExit((code) => exitCodes.push(code));

            await manager.spawn('node', ['-i']);
            await manager.kill();

            expect(exitCodes).toContain(0);
        });
    });

    describe('error handling', () => {
        it('should emit error event on process error', async () => {
            const errors: Error[] = [];
            manager.onError((error) => errors.push(error));

            await manager.spawn('node', ['-i']);
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            const testError = new Error('Test error');
            mockProcess.emit('error', testError);

            expect(errors).toHaveLength(1);
            expect(errors[0].message).toBe('Test error');
            expect(manager.state).toBe('error');
        });
    });

    describe('dispose', () => {
        it('should cleanup on dispose', async () => {
            await manager.spawn('node', ['-i']);

            manager.dispose();

            expect(manager.isRunning).toBe(false);
        });
    });

    describe('state', () => {
        it('should have initial state of idle', () => {
            expect(manager.state).toBe('idle');
            expect(manager.isRunning).toBe(false);
            expect(manager.pid).toBeNull();
        });
    });
});
