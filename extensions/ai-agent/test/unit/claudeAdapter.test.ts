/**
 * ClaudeAdapter Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAdapter, ClaudeAdapterOptions } from '../../src/domain/orchestrator/cliAdapters/claudeAdapter';
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
        exec: vi.fn((cmd: string, callback: (err: any, result: any) => void) => {
            if (cmd === 'claude --version') {
                callback(null, { stdout: 'claude-code v1.0.0', stderr: '' });
            } else {
                callback(new Error('Command not found'), null);
            }
        }),
        __getMockProcess: () => mockProcess,
        __resetMockProcess: () => {
            mockProcess = createMockProcess();
        }
    };
});

describe('ClaudeAdapter', () => {
    let adapter: ClaudeAdapter;

    beforeEach(() => {
        adapter = new ClaudeAdapter();
        vi.clearAllMocks();
    });

    afterEach(() => {
        adapter.dispose();
    });

    describe('constructor', () => {
        it('should have correct name', () => {
            expect(adapter.name).toBe('claude');
        });

        it('should start in idle state', () => {
            expect(adapter.state).toBe('idle');
            expect(adapter.isRunning).toBe(false);
        });

        it('should accept options', () => {
            const options: ClaudeAdapterOptions = {
                model: 'claude-opus-4-5-20251101',
                temperature: 0.7
            };
            const customAdapter = new ClaudeAdapter(options);

            expect(customAdapter.name).toBe('claude');
            customAdapter.dispose();
        });
    });

    describe('spawn', () => {
        it('should spawn claude process', async () => {
            const { spawn } = await import('child_process');

            await adapter.spawn();

            expect(spawn).toHaveBeenCalledWith(
                'claude',
                expect.arrayContaining(['chat']),
                expect.any(Object)
            );
            expect(adapter.isRunning).toBe(true);
        });

        it('should include model argument when specified', async () => {
            const customAdapter = new ClaudeAdapter({
                model: 'claude-opus-4-5-20251101'
            });

            const { spawn } = await import('child_process');
            await customAdapter.spawn();

            expect(spawn).toHaveBeenCalledWith(
                'claude',
                expect.arrayContaining(['--model', 'claude-opus-4-5-20251101', 'chat']),
                expect.any(Object)
            );

            customAdapter.dispose();
        });

        it('should use print mode when specified', async () => {
            const printAdapter = new ClaudeAdapter({
                printMode: true
            });

            const { spawn } = await import('child_process');
            await printAdapter.spawn();

            expect(spawn).toHaveBeenCalledWith(
                'claude',
                expect.arrayContaining(['--print']),
                expect.any(Object)
            );

            printAdapter.dispose();
        });

        it('should emit state changes', async () => {
            const states: ProcessState[] = [];
            adapter.onStateChange((state) => states.push(state));

            await adapter.spawn();

            expect(states).toContain('starting');
            expect(states).toContain('running');
        });
    });

    describe('send', () => {
        it('should send messages via stdin', async () => {
            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            await adapter.send('Hello Claude');

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('Hello Claude\n');
        });

        it('should throw error if not running', async () => {
            await expect(adapter.send('Hello')).rejects.toThrow('claude CLI is not running');
        });

        it('should not double-add newline', async () => {
            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            await adapter.send('Hello Claude\n');

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('Hello Claude\n');
        });
    });

    describe('output events', () => {
        it('should emit response events', async () => {
            const outputs: CLIOutput[] = [];
            adapter.onOutput((output) => outputs.push(output));

            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.stdout.emit('data', Buffer.from('Claude response'));

            expect(outputs).toHaveLength(1);
            expect(outputs[0].type).toBe('stdout');
            expect(outputs[0].data).toBe('Claude response');
        });

        it('should emit stderr events', async () => {
            const outputs: CLIOutput[] = [];
            adapter.onOutput((output) => outputs.push(output));

            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.stderr.emit('data', Buffer.from('Error message'));

            expect(outputs).toHaveLength(1);
            expect(outputs[0].type).toBe('stderr');
        });
    });

    describe('kill', () => {
        it('should terminate the process', async () => {
            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            await adapter.kill();

            expect(mockProcess.kill).toHaveBeenCalled();
            expect(adapter.isRunning).toBe(false);
        });
    });

    describe('process exit', () => {
        it('should handle process exit', async () => {
            const states: ProcessState[] = [];
            adapter.onStateChange((state) => states.push(state));

            await adapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            mockProcess.emit('exit', 0);

            // Wait for state update
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(states).toContain('idle');
        });
    });

    describe('static methods', () => {
        it('should check if installed', async () => {
            const isInstalled = await ClaudeAdapter.isInstalled();

            expect(isInstalled).toBe(true);
        });

        it('should get version', async () => {
            const version = await ClaudeAdapter.getVersion();

            expect(version).toBe('claude-code v1.0.0');
        });
    });

    describe('dispose', () => {
        it('should cleanup resources', async () => {
            await adapter.spawn();

            adapter.dispose();

            expect(adapter.isRunning).toBe(false);
        });
    });

    describe('print mode', () => {
        it('should work differently in print mode', async () => {
            const printAdapter = new ClaudeAdapter({ printMode: true });

            await printAdapter.spawn();
            const { __getMockProcess } = await import('child_process');
            const mockProcess = __getMockProcess();

            await printAdapter.send('Generate code');

            expect(mockProcess.stdin.write).toHaveBeenCalledWith('Generate code\n');

            printAdapter.dispose();
        });
    });
});
