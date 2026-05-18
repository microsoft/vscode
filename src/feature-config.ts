/**
 * Feature Configuration Module
 * 
 * This module provides centralized configuration management for application features.
 * It allows enabling/disabling features dynamically and provides type-safe access
 * to feature flags throughout the application.
 */

export interface FeatureFlags {
	/** Enable experimental AI-powered code suggestions */
	enableAICodeSuggestions: boolean;
	
	/** Enable advanced debugging visualizations */
	enableDebugVisualization: boolean;
	
	/** Enable collaborative editing features */
	enableCollaborativeEditing: boolean;
	
	/** Enable performance monitoring and analytics */
	enablePerformanceMonitoring: boolean;
	
	/** Enable experimental terminal features */
	enableExperimentalTerminal: boolean;
	
	/** Maximum number of concurrent language servers */
	maxLanguageServers: number;
	
	/** Timeout for language server initialization (ms) */
	languageServerTimeout: number;
}

/**
 * Default feature configuration
 */
export const defaultFeatureFlags: FeatureFlags = {
	enableAICodeSuggestions: false,
	enableDebugVisualization: true,
	enableCollaborativeEditing: false,
	enablePerformanceMonitoring: true,
	enableExperimentalTerminal: false,
	maxLanguageServers: 5,
	languageServerTimeout: 30000,
};

/**
 * Feature configuration manager
 */
export class FeatureConfigManager {
	private features: FeatureFlags;
	private listeners: Set<(flags: FeatureFlags) => void>;

	constructor(initialFlags?: Partial<FeatureFlags>) {
		this.features = { ...defaultFeatureFlags, ...initialFlags };
		this.listeners = new Set();
	}

	/**
	 * Get the current feature flags
	 */
	public getFeatures(): Readonly<FeatureFlags> {
		return { ...this.features };
	}

	/**
	 * Check if a specific feature is enabled
	 */
	public isFeatureEnabled(feature: keyof FeatureFlags): boolean {
		const value = this.features[feature];
		return typeof value === 'boolean' ? value : false;
	}

	/**
	 * Update feature flags
	 */
	public updateFeatures(updates: Partial<FeatureFlags>): void {
		this.features = { ...this.features, ...updates };
		this.notifyListeners();
	}

	/**
	 * Subscribe to feature flag changes
	 */
	public subscribe(listener: (flags: FeatureFlags) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Notify all listeners of feature flag changes
	 */
	private notifyListeners(): void {
		const currentFlags = this.getFeatures();
		this.listeners.forEach(listener => listener(currentFlags));
	}

	/**
	 * Reset all features to default values
	 */
	public reset(): void {
		this.features = { ...defaultFeatureFlags };
		this.notifyListeners();
	}

	/**
	 * Load features from storage
	 */
	public async loadFromStorage(storage: Storage): Promise<void> {
		try {
			const stored = storage.getItem('featureFlags');
			if (stored) {
				const parsed = JSON.parse(stored);
				this.updateFeatures(parsed);
			}
		} catch (error) {
			console.error('Failed to load feature flags from storage:', error);
		}
	}

	/**
	 * Save features to storage
	 */
	public async saveToStorage(storage: Storage): Promise<void> {
		try {
			storage.setItem('featureFlags', JSON.stringify(this.features));
		} catch (error) {
			console.error('Failed to save feature flags to storage:', error);
		}
	}
}

/**
 * Global feature configuration instance
 */
export const featureConfig = new FeatureConfigManager();

/**
 * Storage interface for feature flags persistence
 */
interface Storage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}
