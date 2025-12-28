/**
 * CLI-related type definitions
 * Defines interfaces for CLI adapters and process management
 */

import type { Event, Disposable } from 'vscode';

/**
 * Development phases supported by Code Ship
 */
export type Phase = 'design' | 'implementation' | 'review';

/**
 * Supported CLI types
 */
export type CLIType = 'claude' | 'gemini' | 'codex';

/**
 * Process state enumeration
 */
export type ProcessState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * CLI output event data
 */
export interface CLIOutput {
    /** Output type */
    type: 'stdout' | 'stderr';
    /** Raw output data */
    data: string;
    /** Timestamp */
    timestamp: number;
}

/**
 * CLI process status
 */
export interface CLIStatus {
    /** Current process state */
    state: ProcessState;
    /** Active CLI type */
    cli: CLIType | null;
    /** Process ID if running */
    pid: number | null;
    /** Error message if in error state */
    error?: string;
}

/**
 * CLI configuration from ship_config.json
 */
export interface CLIConfig {
    /** AI model identifier */
    model: string;
    /** CLI command name */
    cli: CLIType;
    /** Temperature setting for AI */
    temperature: number;
    /** Additional CLI arguments */
    args?: string[];
}

/**
 * Phase-specific crew configuration
 */
export interface CrewConfig {
    design_phase: CLIConfig;
    implementation_phase: CLIConfig;
    review_phase: CLIConfig;
}

/**
 * Handover strategy options
 */
export type HandoverStrategy = 'self_maintained' | 'dedicated_boatswain';

/**
 * Main ship configuration schema
 */
export interface ShipConfig {
    /** Phase-specific CLI configurations */
    crew: CrewConfig;
    /** Handover strategy for phase transitions */
    handover_strategy: HandoverStrategy;
    /** Maintenance crew model (for dedicated_boatswain strategy) */
    maintenance_crew?: string;
}

/**
 * CLI Adapter interface
 * Defines the contract for CLI implementations
 */
export interface ICLIAdapter extends Disposable {
    /** CLI type identifier */
    readonly name: CLIType;

    /** Current process state */
    readonly state: ProcessState;

    /** Event fired when CLI outputs data */
    readonly onOutput: Event<CLIOutput>;

    /** Event fired when CLI state changes */
    readonly onStateChange: Event<ProcessState>;

    /**
     * Spawn the CLI process
     * @param args Additional command line arguments
     */
    spawn(args?: string[]): Promise<void>;

    /**
     * Send a message to the CLI
     * @param message Message to send
     */
    send(message: string): Promise<void>;

    /**
     * Terminate the CLI process
     */
    kill(): Promise<void>;
}

/**
 * Process manager options
 */
export interface ProcessOptions {
    /** Working directory */
    cwd?: string;
    /** Environment variables */
    env?: NodeJS.ProcessEnv;
    /** Timeout in milliseconds */
    timeout?: number;
}

/**
 * Spawn result
 */
export interface SpawnResult {
    /** Process ID */
    pid: number;
    /** Success status */
    success: boolean;
}
