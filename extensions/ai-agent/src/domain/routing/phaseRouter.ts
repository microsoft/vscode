/**
 * Phase Router
 * Routes development phases to appropriate CLI adapters
 *
 * Phase 3.4: Phase-based Routing
 * Enables dynamic CLI switching based on development phase.
 */

import { EventEmitter, Disposable } from 'vscode';
import type { Phase, CLIType, ICLIAdapter, ShipConfig, CLIConfig } from '../../types';
import { ClaudeAdapter, ClaudeAdapterOptions } from '../orchestrator/cliAdapters/claudeAdapter';
import { GeminiAdapter, GeminiAdapterOptions } from '../orchestrator/cliAdapters/geminiAdapter';
import { CodexAdapter, CodexAdapterOptions } from '../orchestrator/cliAdapters/codexAdapter';

/**
 * Phase transition event
 */
export interface PhaseTransition {
    /** Previous phase */
    from: Phase | null;
    /** New phase */
    to: Phase;
    /** Previous CLI type */
    fromCli: CLIType | null;
    /** New CLI type */
    toCli: CLIType;
    /** Timestamp of transition */
    timestamp: number;
}

/**
 * Phase router options
 */
export interface PhaseRouterOptions {
    /** Ship configuration */
    config: ShipConfig;
    /** Working directory for CLI adapters */
    cwd?: string;
}

/**
 * Phase Router
 * Manages CLI adapter instances based on development phase.
 *
 * Default phase-CLI mapping:
 * - Design → Claude (planning, architecture, specifications)
 * - Implementation → Gemini (code generation, refactoring)
 * - Review → Codex (code review, quality analysis)
 */
export class PhaseRouter implements Disposable {
    private readonly config: ShipConfig;
    private readonly cwd?: string;

    private currentPhase: Phase | null = null;
    private currentAdapter: ICLIAdapter | null = null;
    private readonly adapters = new Map<CLIType, ICLIAdapter>();

    private readonly _onPhaseChange = new EventEmitter<PhaseTransition>();
    readonly onPhaseChange = this._onPhaseChange.event;

    private readonly _onAdapterChange = new EventEmitter<ICLIAdapter>();
    readonly onAdapterChange = this._onAdapterChange.event;

    constructor(options: PhaseRouterOptions) {
        this.config = options.config;
        this.cwd = options.cwd;
    }

    /**
     * Get the current development phase
     */
    get phase(): Phase | null {
        return this.currentPhase;
    }

    /**
     * Get the current CLI adapter
     */
    get adapter(): ICLIAdapter | null {
        return this.currentAdapter;
    }

    /**
     * Get the CLI type for a given phase
     * @param phase Development phase
     */
    getCLIForPhase(phase: Phase): CLIType {
        switch (phase) {
            case 'design':
                return this.config.crew.design_phase.cli;
            case 'implementation':
                return this.config.crew.implementation_phase.cli;
            case 'review':
                return this.config.crew.review_phase.cli;
            default:
                throw new Error(`Unknown phase: ${phase}`);
        }
    }

    /**
     * Get the configuration for a given phase
     * @param phase Development phase
     */
    getConfigForPhase(phase: Phase): CLIConfig {
        switch (phase) {
            case 'design':
                return this.config.crew.design_phase;
            case 'implementation':
                return this.config.crew.implementation_phase;
            case 'review':
                return this.config.crew.review_phase;
            default:
                throw new Error(`Unknown phase: ${phase}`);
        }
    }

    /**
     * Switch to a new development phase
     * This will:
     * 1. Stop the current CLI adapter (if any)
     * 2. Create/retrieve the adapter for the new phase
     * 3. Fire phase change event
     *
     * @param phase New development phase
     */
    async switchPhase(phase: Phase): Promise<ICLIAdapter> {
        const previousPhase = this.currentPhase;
        const previousCli = this.currentAdapter?.name ?? null;

        // Get CLI type for the new phase
        const cliType = this.getCLIForPhase(phase);
        const cliConfig = this.getConfigForPhase(phase);

        // Stop current adapter if switching CLI types
        if (this.currentAdapter && this.currentAdapter.name !== cliType) {
            await this.currentAdapter.kill();
        }

        // Get or create adapter for the new CLI type
        let adapter = this.adapters.get(cliType);
        if (!adapter) {
            adapter = this.createAdapter(cliType, cliConfig);
            this.adapters.set(cliType, adapter);
        }

        // Update current state
        this.currentPhase = phase;
        this.currentAdapter = adapter;

        // Fire events
        const transition: PhaseTransition = {
            from: previousPhase,
            to: phase,
            fromCli: previousCli,
            toCli: cliType,
            timestamp: Date.now()
        };
        this._onPhaseChange.fire(transition);
        this._onAdapterChange.fire(adapter);

        return adapter;
    }

    /**
     * Create a CLI adapter instance
     * @param cliType CLI type
     * @param config CLI configuration
     */
    private createAdapter(cliType: CLIType, config: CLIConfig): ICLIAdapter {
        const baseOptions = {
            cwd: this.cwd,
            args: config.args
        };

        switch (cliType) {
            case 'claude':
                return new ClaudeAdapter({
                    ...baseOptions,
                    model: config.model
                } as ClaudeAdapterOptions);

            case 'gemini':
                return new GeminiAdapter({
                    ...baseOptions,
                    model: config.model
                } as GeminiAdapterOptions);

            case 'codex':
                return new CodexAdapter({
                    ...baseOptions,
                    model: config.model,
                    temperature: config.temperature
                } as CodexAdapterOptions);

            default:
                throw new Error(`Unknown CLI type: ${cliType}`);
        }
    }

    /**
     * Start the current adapter
     * @param args Additional arguments
     */
    async startAdapter(args: string[] = []): Promise<void> {
        if (!this.currentAdapter) {
            throw new Error('No phase selected. Call switchPhase first.');
        }
        await this.currentAdapter.spawn(args);
    }

    /**
     * Send a message to the current adapter
     * @param message Message to send
     */
    async send(message: string): Promise<void> {
        if (!this.currentAdapter) {
            throw new Error('No phase selected. Call switchPhase first.');
        }
        await this.currentAdapter.send(message);
    }

    /**
     * Stop the current adapter
     */
    async stopAdapter(): Promise<void> {
        if (this.currentAdapter) {
            await this.currentAdapter.kill();
        }
    }

    /**
     * Check if all required CLIs are installed
     */
    async checkCLIAvailability(): Promise<Map<CLIType, boolean>> {
        const results = new Map<CLIType, boolean>();

        results.set('claude', await ClaudeAdapter.isInstalled());
        results.set('gemini', await GeminiAdapter.isInstalled());
        results.set('codex', await CodexAdapter.isInstalled());

        return results;
    }

    /**
     * Dispose of all adapters
     */
    dispose(): void {
        for (const adapter of this.adapters.values()) {
            adapter.dispose();
        }
        this.adapters.clear();
        this.currentAdapter = null;
        this.currentPhase = null;
        this._onPhaseChange.dispose();
        this._onAdapterChange.dispose();
    }
}
