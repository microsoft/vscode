/**
 * Configuration Loader
 * Loads and validates ship_config.json for phase routing
 *
 * Phase 3.4: Phase-based Routing
 * Configuration file format documented in design/04_Data_Schema.md
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ShipConfig, CLIType, HandoverStrategy } from '../../types';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ShipConfig = {
    crew: {
        design_phase: {
            model: 'claude-opus-4-5-20251101',
            cli: 'claude',
            temperature: 0.7
        },
        implementation_phase: {
            model: 'gemini-2.0-flash-exp',
            cli: 'gemini',
            temperature: 0.3
        },
        review_phase: {
            model: 'gpt-4-turbo',
            cli: 'codex',
            temperature: 0.2
        }
    },
    handover_strategy: 'self_maintained'
};

/**
 * Configuration file name
 */
export const CONFIG_FILE_NAME = 'ship_config.json';

/**
 * Configuration load result
 */
export interface ConfigLoadResult {
    /** Loaded configuration */
    config: ShipConfig;
    /** Path to the configuration file */
    path: string | null;
    /** Whether the configuration was loaded from file */
    fromFile: boolean;
    /** Validation warnings */
    warnings: string[];
}

/**
 * Configuration Loader
 * Loads ship_config.json from workspace or uses defaults
 */
export class ConfigLoader {
    private readonly workspaceRoot: string;
    private cachedConfig: ShipConfig | null = null;
    private configPath: string | null = null;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Load configuration from ship_config.json or use defaults
     * @param forceReload Force reload from file
     */
    async load(forceReload: boolean = false): Promise<ConfigLoadResult> {
        if (this.cachedConfig && !forceReload) {
            return {
                config: this.cachedConfig,
                path: this.configPath,
                fromFile: this.configPath !== null,
                warnings: []
            };
        }

        const warnings: string[] = [];
        let config = { ...DEFAULT_CONFIG };
        let configPath: string | null = null;
        let fromFile = false;

        // Try to load from workspace
        const possiblePaths = [
            path.join(this.workspaceRoot, CONFIG_FILE_NAME),
            path.join(this.workspaceRoot, '.codeship', CONFIG_FILE_NAME),
            path.join(this.workspaceRoot, '.vscode', CONFIG_FILE_NAME)
        ];

        for (const tryPath of possiblePaths) {
            try {
                if (fs.existsSync(tryPath)) {
                    const content = fs.readFileSync(tryPath, 'utf-8');
                    const parsed = JSON.parse(content);
                    const validation = this.validateConfig(parsed);

                    if (validation.valid) {
                        config = this.mergeWithDefaults(parsed);
                        configPath = tryPath;
                        fromFile = true;
                        warnings.push(...validation.warnings);
                        break;
                    } else {
                        warnings.push(`Invalid config at ${tryPath}: ${validation.errors.join(', ')}`);
                    }
                }
            } catch (error) {
                warnings.push(`Error reading ${tryPath}: ${error}`);
            }
        }

        this.cachedConfig = config;
        this.configPath = configPath;

        return {
            config,
            path: configPath,
            fromFile,
            warnings
        };
    }

    /**
     * Validate configuration structure
     * @param config Configuration to validate
     */
    private validateConfig(config: unknown): { valid: boolean; errors: string[]; warnings: string[] } {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!config || typeof config !== 'object') {
            errors.push('Configuration must be an object');
            return { valid: false, errors, warnings };
        }

        const cfg = config as Record<string, unknown>;

        // Validate crew configuration
        if (!cfg.crew || typeof cfg.crew !== 'object') {
            errors.push('Missing crew configuration');
        } else {
            const crew = cfg.crew as Record<string, unknown>;
            const phases = ['design_phase', 'implementation_phase', 'review_phase'];

            for (const phase of phases) {
                if (!crew[phase] || typeof crew[phase] !== 'object') {
                    warnings.push(`Missing ${phase} configuration, using defaults`);
                } else {
                    const phaseConfig = crew[phase] as Record<string, unknown>;
                    if (!this.isValidCLIType(phaseConfig.cli)) {
                        errors.push(`Invalid CLI type in ${phase}: ${phaseConfig.cli}`);
                    }
                }
            }
        }

        // Validate handover strategy
        if (cfg.handover_strategy && !this.isValidHandoverStrategy(cfg.handover_strategy)) {
            errors.push(`Invalid handover_strategy: ${cfg.handover_strategy}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Check if CLI type is valid
     */
    private isValidCLIType(cli: unknown): cli is CLIType {
        return cli === 'claude' || cli === 'gemini' || cli === 'codex';
    }

    /**
     * Check if handover strategy is valid
     */
    private isValidHandoverStrategy(strategy: unknown): strategy is HandoverStrategy {
        return strategy === 'self_maintained' || strategy === 'dedicated_boatswain';
    }

    /**
     * Merge loaded config with defaults
     * @param loaded Loaded configuration
     */
    private mergeWithDefaults(loaded: Partial<ShipConfig>): ShipConfig {
        return {
            crew: {
                design_phase: {
                    ...DEFAULT_CONFIG.crew.design_phase,
                    ...loaded.crew?.design_phase
                },
                implementation_phase: {
                    ...DEFAULT_CONFIG.crew.implementation_phase,
                    ...loaded.crew?.implementation_phase
                },
                review_phase: {
                    ...DEFAULT_CONFIG.crew.review_phase,
                    ...loaded.crew?.review_phase
                }
            },
            handover_strategy: loaded.handover_strategy ?? DEFAULT_CONFIG.handover_strategy,
            maintenance_crew: loaded.maintenance_crew
        };
    }

    /**
     * Save configuration to file
     * @param config Configuration to save
     * @param targetPath Target file path (optional, uses last loaded path)
     */
    async save(config: ShipConfig, targetPath?: string): Promise<void> {
        const savePath = targetPath ?? this.configPath ?? path.join(this.workspaceRoot, CONFIG_FILE_NAME);

        const dir = path.dirname(savePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const content = JSON.stringify(config, null, 2);
        fs.writeFileSync(savePath, content, 'utf-8');

        this.cachedConfig = config;
        this.configPath = savePath;
    }

    /**
     * Get the configuration file path
     */
    getConfigPath(): string | null {
        return this.configPath;
    }

    /**
     * Clear cached configuration
     */
    clearCache(): void {
        this.cachedConfig = null;
        this.configPath = null;
    }
}
