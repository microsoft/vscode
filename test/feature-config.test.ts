/**
 * Tests for Feature Configuration Module
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FeatureConfigManager, defaultFeatureFlags } from '../src/feature-config';

describe('FeatureConfigManager', () => {
	let manager: FeatureConfigManager;

	beforeEach(() => {
		manager = new FeatureConfigManager();
	});

	describe('initialization', () => {
		it('should initialize with default flags', () => {
			const flags = manager.getFeatures();
			expect(flags).toEqual(defaultFeatureFlags);
		});

		it('should initialize with custom flags', () => {
			const customManager = new FeatureConfigManager({
				enableAICodeSuggestions: true,
				maxLanguageServers: 10
			});
			const flags = customManager.getFeatures();
			expect(flags.enableAICodeSuggestions).toBe(true);
			expect(flags.maxLanguageServers).toBe(10);
		});

		it('should merge custom flags with defaults', () => {
			const customManager = new FeatureConfigManager({
				enableAICodeSuggestions: true
			});
			const flags = customManager.getFeatures();
			expect(flags.enableAICodeSuggestions).toBe(true);
			expect(flags.enableDebugVisualization).toBe(defaultFeatureFlags.enableDebugVisualization);
		});
	});

	describe('isFeatureEnabled', () => {
		it('should return true for enabled boolean features', () => {
			manager.updateFeatures({ enableDebugVisualization: true });
			expect(manager.isFeatureEnabled('enableDebugVisualization')).toBe(true);
		});

		it('should return false for disabled boolean features', () => {
			manager.updateFeatures({ enableAICodeSuggestions: false });
			expect(manager.isFeatureEnabled('enableAICodeSuggestions')).toBe(false);
		});

		it('should return false for non-boolean features', () => {
			expect(manager.isFeatureEnabled('maxLanguageServers')).toBe(false);
		});
	});

	describe('updateFeatures', () => {
		it('should update single feature', () => {
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(manager.getFeatures().enableAICodeSuggestions).toBe(true);
		});

		it('should update multiple features', () => {
			manager.updateFeatures({
				enableAICodeSuggestions: true,
				maxLanguageServers: 8
			});
			const flags = manager.getFeatures();
			expect(flags.enableAICodeSuggestions).toBe(true);
			expect(flags.maxLanguageServers).toBe(8);
		});

		it('should not affect other features', () => {
			const originalTimeout = manager.getFeatures().languageServerTimeout;
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(manager.getFeatures().languageServerTimeout).toBe(originalTimeout);
		});
	});

	describe('subscription', () => {
		it('should notify listeners on update', () => {
			let notified = false;
			manager.subscribe(() => {
				notified = true;
			});
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(notified).toBe(true);
		});

		it('should pass current flags to listeners', () => {
			let receivedFlags = null;
			manager.subscribe((flags) => {
				receivedFlags = flags;
			});
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(receivedFlags).toBeDefined();
			expect(receivedFlags?.enableAICodeSuggestions).toBe(true);
		});

		it('should allow unsubscribing', () => {
			let callCount = 0;
			const unsubscribe = manager.subscribe(() => {
				callCount++;
			});
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(callCount).toBe(1);
			
			unsubscribe();
			manager.updateFeatures({ enableAICodeSuggestions: false });
			expect(callCount).toBe(1);
		});

		it('should support multiple listeners', () => {
			let count1 = 0;
			let count2 = 0;
			manager.subscribe(() => count1++);
			manager.subscribe(() => count2++);
			manager.updateFeatures({ enableAICodeSuggestions: true });
			expect(count1).toBe(1);
			expect(count2).toBe(1);
		});
	});

	describe('reset', () => {
		it('should reset to default flags', () => {
			manager.updateFeatures({
				enableAICodeSuggestions: true,
				maxLanguageServers: 10
			});
			manager.reset();
			expect(manager.getFeatures()).toEqual(defaultFeatureFlags);
		});

		it('should notify listeners on reset', () => {
			let notified = false;
			manager.subscribe(() => {
				notified = true;
			});
			manager.reset();
			expect(notified).toBe(true);
		});
	});

	describe('storage', () => {
		let mockStorage: Map<string, string>;

		beforeEach(() => {
			mockStorage = new Map();
		});

		const createMockStorage = () => ({
			getItem: (key: string) => mockStorage.get(key) || null,
			setItem: (key: string, value: string) => mockStorage.set(key, value)
		});

		it('should save features to storage', async () => {
			manager.updateFeatures({ enableAICodeSuggestions: true });
			await manager.saveToStorage(createMockStorage());
			
			const stored = mockStorage.get('featureFlags');
			expect(stored).toBeDefined();
			const parsed = JSON.parse(stored!);
			expect(parsed.enableAICodeSuggestions).toBe(true);
		});

		it('should load features from storage', async () => {
			const testFlags = { ...defaultFeatureFlags, enableAICodeSuggestions: true };
			mockStorage.set('featureFlags', JSON.stringify(testFlags));
			
			await manager.loadFromStorage(createMockStorage());
			expect(manager.getFeatures().enableAICodeSuggestions).toBe(true);
		});

		it('should handle missing storage gracefully', async () => {
			await expect(manager.loadFromStorage(createMockStorage())).resolves.not.toThrow();
		});

		it('should handle invalid JSON in storage', async () => {
			mockStorage.set('featureFlags', 'invalid json');
			await expect(manager.loadFromStorage(createMockStorage())).resolves.not.toThrow();
		});
	});
});
