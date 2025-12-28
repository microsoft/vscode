/**
 * Dependency Manager
 * Checks and manages CLI dependencies for Code Ship
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { CLIType } from '../../types';

const execAsync = promisify(exec);

/**
 * Dependency status for a CLI
 */
export interface DependencyStatus {
    /** CLI identifier */
    cli: CLIType;
    /** Whether the CLI is installed */
    installed: boolean;
    /** Version if installed */
    version?: string;
    /** Install command if not installed */
    installCommand?: string;
    /** Error message if check failed */
    error?: string;
}

/**
 * CLI configuration for dependency checking
 */
interface CLIInfo {
    /** Command to check version */
    versionCommand: string;
    /** Install command */
    installCommand: string;
    /** Windows-specific check command */
    windowsCheckCommand?: string;
}

/**
 * CLI information registry
 */
const CLI_REGISTRY: Record<CLIType, CLIInfo> = {
    claude: {
        versionCommand: 'claude --version',
        installCommand: 'npm install -g @anthropic-ai/claude-code',
        windowsCheckCommand: 'where claude'
    },
    gemini: {
        versionCommand: 'gemini --version',
        installCommand: 'npm install -g @google/gemini-cli',
        windowsCheckCommand: 'where gemini'
    },
    codex: {
        versionCommand: 'codex --version',
        installCommand: 'npm install -g @openai/codex-cli',
        windowsCheckCommand: 'where codex'
    }
};

/**
 * DependencyManager class
 * Manages CLI dependency checking and installation guidance
 */
export class DependencyManager {
    private readonly isWindows: boolean;

    constructor() {
        this.isWindows = process.platform === 'win32';
    }

    /**
     * Check if a specific CLI is installed
     * @param cli CLI type to check
     */
    async checkCLI(cli: CLIType): Promise<DependencyStatus> {
        const info = CLI_REGISTRY[cli];

        if (!info) {
            return {
                cli,
                installed: false,
                error: `Unknown CLI: ${cli}`
            };
        }

        try {
            // First check if command exists
            const exists = await this.commandExists(cli, info);

            if (!exists) {
                return {
                    cli,
                    installed: false,
                    installCommand: info.installCommand
                };
            }

            // Get version
            const version = await this.getVersion(info.versionCommand);

            return {
                cli,
                installed: true,
                version
            };
        } catch (error) {
            return {
                cli,
                installed: false,
                installCommand: info.installCommand,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Check all required CLIs
     */
    async checkAllDependencies(): Promise<DependencyStatus[]> {
        const clis: CLIType[] = ['claude', 'gemini', 'codex'];
        return Promise.all(clis.map(cli => this.checkCLI(cli)));
    }

    /**
     * Check if any required CLI is missing
     */
    async hasMissingDependencies(): Promise<boolean> {
        const statuses = await this.checkAllDependencies();
        return statuses.some(s => !s.installed);
    }

    /**
     * Get missing dependencies
     */
    async getMissingDependencies(): Promise<DependencyStatus[]> {
        const statuses = await this.checkAllDependencies();
        return statuses.filter(s => !s.installed);
    }

    /**
     * Get installed dependencies
     */
    async getInstalledDependencies(): Promise<DependencyStatus[]> {
        const statuses = await this.checkAllDependencies();
        return statuses.filter(s => s.installed);
    }

    /**
     * Get install command for a CLI
     * @param cli CLI type
     */
    getInstallCommand(cli: CLIType): string {
        return CLI_REGISTRY[cli]?.installCommand ?? '';
    }

    /**
     * Check if a command exists on the system
     */
    private async commandExists(cli: CLIType, info: CLIInfo): Promise<boolean> {
        try {
            if (this.isWindows && info.windowsCheckCommand) {
                await execAsync(info.windowsCheckCommand);
            } else {
                await execAsync(`which ${cli}`);
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get version from CLI
     */
    private async getVersion(command: string): Promise<string | undefined> {
        try {
            const { stdout } = await execAsync(command);
            return stdout.trim();
        } catch {
            return undefined;
        }
    }

    /**
     * Generate dependency report
     */
    async generateReport(): Promise<string> {
        const statuses = await this.checkAllDependencies();
        const lines: string[] = ['Code Ship CLI Dependencies Report', '='.repeat(40), ''];

        for (const status of statuses) {
            if (status.installed) {
                lines.push(`✓ ${status.cli}: ${status.version || 'installed'}`);
            } else {
                lines.push(`✗ ${status.cli}: not installed`);
                if (status.installCommand) {
                    lines.push(`  Install: ${status.installCommand}`);
                }
            }
        }

        const installed = statuses.filter(s => s.installed).length;
        const total = statuses.length;

        lines.push('');
        lines.push(`${installed}/${total} dependencies installed`);

        return lines.join('\n');
    }
}
