/**
 * DependencyManager Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DependencyManager } from '../../src/domain/dependency/dependencyManager';

// Mock child_process
vi.mock('child_process', () => {
    return {
        exec: vi.fn((cmd: string, callback: (err: any, result: any) => void) => {
            // Simulate installed CLIs
            if (cmd === 'claude --version' || cmd === 'where claude') {
                callback(null, { stdout: 'claude-code v1.0.0', stderr: '' });
            } else if (cmd === 'which claude') {
                callback(null, { stdout: '/usr/local/bin/claude', stderr: '' });
            } else if (cmd === 'gemini --version' || cmd === 'where gemini') {
                callback(new Error('Command not found'), null);
            } else if (cmd === 'which gemini') {
                callback(new Error('Command not found'), null);
            } else if (cmd === 'codex --version' || cmd === 'where codex') {
                callback(new Error('Command not found'), null);
            } else if (cmd === 'which codex') {
                callback(new Error('Command not found'), null);
            } else {
                callback(new Error('Unknown command'), null);
            }
        })
    };
});

describe('DependencyManager', () => {
    let manager: DependencyManager;

    beforeEach(() => {
        manager = new DependencyManager();
        vi.clearAllMocks();
    });

    describe('checkCLI', () => {
        it('should detect installed CLI', async () => {
            const status = await manager.checkCLI('claude');

            expect(status.cli).toBe('claude');
            expect(status.installed).toBe(true);
            expect(status.version).toBe('claude-code v1.0.0');
        });

        it('should return false for missing CLI', async () => {
            const status = await manager.checkCLI('gemini');

            expect(status.cli).toBe('gemini');
            expect(status.installed).toBe(false);
            expect(status.installCommand).toBeDefined();
        });

        it('should provide correct install command', async () => {
            const status = await manager.checkCLI('gemini');

            expect(status.installCommand).toBe('npm install -g @google/gemini-cli');
        });

        it('should handle codex CLI', async () => {
            const status = await manager.checkCLI('codex');

            expect(status.cli).toBe('codex');
            expect(status.installed).toBe(false);
            expect(status.installCommand).toBe('npm install -g @openai/codex-cli');
        });
    });

    describe('checkAllDependencies', () => {
        it('should check all CLIs', async () => {
            const statuses = await manager.checkAllDependencies();

            expect(statuses).toHaveLength(3);
            expect(statuses.map(s => s.cli)).toContain('claude');
            expect(statuses.map(s => s.cli)).toContain('gemini');
            expect(statuses.map(s => s.cli)).toContain('codex');
        });
    });

    describe('hasMissingDependencies', () => {
        it('should return true when dependencies are missing', async () => {
            const hasMissing = await manager.hasMissingDependencies();

            expect(hasMissing).toBe(true);
        });
    });

    describe('getMissingDependencies', () => {
        it('should return only missing dependencies', async () => {
            const missing = await manager.getMissingDependencies();

            expect(missing.length).toBeGreaterThan(0);
            expect(missing.every(s => !s.installed)).toBe(true);
        });

        it('should not include installed dependencies', async () => {
            const missing = await manager.getMissingDependencies();

            expect(missing.find(s => s.cli === 'claude')).toBeUndefined();
        });
    });

    describe('getInstalledDependencies', () => {
        it('should return only installed dependencies', async () => {
            const installed = await manager.getInstalledDependencies();

            expect(installed.every(s => s.installed)).toBe(true);
        });

        it('should include claude', async () => {
            const installed = await manager.getInstalledDependencies();

            expect(installed.find(s => s.cli === 'claude')).toBeDefined();
        });
    });

    describe('getInstallCommand', () => {
        it('should return correct install command for claude', () => {
            const command = manager.getInstallCommand('claude');

            expect(command).toBe('npm install -g @anthropic-ai/claude-code');
        });

        it('should return correct install command for gemini', () => {
            const command = manager.getInstallCommand('gemini');

            expect(command).toBe('npm install -g @google/gemini-cli');
        });

        it('should return correct install command for codex', () => {
            const command = manager.getInstallCommand('codex');

            expect(command).toBe('npm install -g @openai/codex-cli');
        });
    });

    describe('generateReport', () => {
        it('should generate a report string', async () => {
            const report = await manager.generateReport();

            expect(report).toContain('Code Ship CLI Dependencies Report');
            expect(report).toContain('claude');
            expect(report).toContain('gemini');
            expect(report).toContain('codex');
        });

        it('should show installed CLIs with checkmark', async () => {
            const report = await manager.generateReport();

            expect(report).toContain('✓ claude');
        });

        it('should show missing CLIs with X', async () => {
            const report = await manager.generateReport();

            expect(report).toContain('✗ gemini');
        });

        it('should show install command for missing CLIs', async () => {
            const report = await manager.generateReport();

            expect(report).toContain('Install:');
        });

        it('should show summary count', async () => {
            const report = await manager.generateReport();

            expect(report).toMatch(/\d+\/\d+ dependencies installed/);
        });
    });
});
