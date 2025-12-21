/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import {
	DSpaceModelId,
	IDSpaceModelProvider,
	IDSpaceModelProviderService,
} from './modelProvider.js';
import { OnlineModelProvider } from './onlineModelProvider.js';
import { OfflineModelProvider } from './offlineModelProvider.js';

const STORAGE_KEY_ACTIVE_PROVIDER = 'dspace.activeModelProvider';

/**
 * Service that manages DSpace model providers
 * Handles provider registration, selection, and online/offline detection
 */
export class DSpaceModelProviderService extends Disposable implements IDSpaceModelProviderService {
	declare readonly _serviceBrand: undefined;

	private readonly providers = new Map<DSpaceModelId, IDSpaceModelProvider>();
	private activeProviderId: DSpaceModelId = DSpaceModelId.Online;

	private readonly _onDidChangeActiveProvider = this._register(new Emitter<DSpaceModelId>());
	readonly onDidChangeActiveProvider: Event<DSpaceModelId> = this._onDidChangeActiveProvider.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		// Initialize providers
		this.initializeProviders();

		// Restore last selected provider
		this.restoreActiveProvider();

		// Auto-select if offline
		this.setupOnlineListener();
	}

	/**
	 * Initialize the available model providers
	 */
	private initializeProviders(): void {
		this.logService.info('[DSpaceModelProviderService] Initializing providers');

		// Register online provider
		const onlineProvider = this.instantiationService.createInstance(OnlineModelProvider);
		this.providers.set(DSpaceModelId.Online, onlineProvider);

		// Register offline provider
		const offlineProvider = this.instantiationService.createInstance(OfflineModelProvider);
		this.providers.set(DSpaceModelId.Offline, offlineProvider);

		this.logService.info('[DSpaceModelProviderService] Providers initialized:', Array.from(this.providers.keys()));
	}

	/**
	 * Restore the last selected provider from storage
	 */
	private restoreActiveProvider(): void {
		const storedId = this.storageService.get(STORAGE_KEY_ACTIVE_PROVIDER, StorageScope.PROFILE);

		if (storedId && (storedId === DSpaceModelId.Online || storedId === DSpaceModelId.Offline)) {
			this.activeProviderId = storedId as DSpaceModelId;
			this.logService.info('[DSpaceModelProviderService] Restored provider from storage:', storedId);
		} else {
			// Default to online, but auto-select if offline
			this.autoSelectProvider();
		}
	}

	/**
	 * Set up listener for online/offline status changes
	 */
	private setupOnlineListener(): void {
		mainWindow.addEventListener('online', () => {
			this.logService.info('[DSpaceModelProviderService] Browser went online');
			// Don't auto-switch to online - let user decide
		});

		mainWindow.addEventListener('offline', () => {
			this.logService.info('[DSpaceModelProviderService] Browser went offline');
			// Auto-switch to offline provider if currently using online
			if (this.activeProviderId === DSpaceModelId.Online) {
				this.autoSelectProvider();
			}
		});
	}

	/**
	 * Get all registered providers
	 */
	getProviders(): IDSpaceModelProvider[] {
		return Array.from(this.providers.values());
	}

	/**
	 * Get the currently active provider
	 */
	getActiveProvider(): IDSpaceModelProvider {
		const provider = this.providers.get(this.activeProviderId);
		if (!provider) {
			// Fallback to online if active provider not found
			this.logService.warn('[DSpaceModelProviderService] Active provider not found, falling back to online');
			return this.providers.get(DSpaceModelId.Online)!;
		}
		return provider;
	}

	/**
	 * Set the active provider by ID
	 */
	setActiveProvider(id: DSpaceModelId): void {
		if (!this.providers.has(id)) {
			this.logService.warn('[DSpaceModelProviderService] Unknown provider ID:', id);
			return;
		}

		if (this.activeProviderId !== id) {
			this.activeProviderId = id;
			this.storageService.store(STORAGE_KEY_ACTIVE_PROVIDER, id, StorageScope.PROFILE, StorageTarget.USER);
			this.logService.info('[DSpaceModelProviderService] Active provider changed to:', id);
			this._onDidChangeActiveProvider.fire(id);
		}
	}

	/**
	 * Get the active provider ID
	 */
	getActiveProviderId(): DSpaceModelId {
		return this.activeProviderId;
	}

	/**
	 * Check if the system is currently online
	 */
	isOnline(): boolean {
		if (typeof navigator !== 'undefined') {
			return navigator.onLine;
		}
		return true; // Assume online in non-browser environments
	}

	/**
	 * Auto-select the best provider based on connectivity
	 */
	async autoSelectProvider(): Promise<void> {
		this.logService.info('[DSpaceModelProviderService] Auto-selecting provider...');

		const isOnline = this.isOnline();

		if (isOnline) {
			// Prefer online if available
			this.setActiveProvider(DSpaceModelId.Online);
		} else {
			// Check if offline provider is available (WebGPU)
			const offlineProvider = this.providers.get(DSpaceModelId.Offline);
			if (offlineProvider) {
				const isAvailable = await offlineProvider.isAvailable();
				if (isAvailable) {
					this.setActiveProvider(DSpaceModelId.Offline);
					this.logService.info('[DSpaceModelProviderService] Auto-selected offline provider (no internet)');
				} else {
					// WebGPU not available, keep online (will fail but with clear error)
					this.logService.warn('[DSpaceModelProviderService] Offline provider not available (no WebGPU), keeping online');
				}
			}
		}
	}

	/**
	 * Get provider by ID
	 */
	getProvider(id: DSpaceModelId): IDSpaceModelProvider | undefined {
		return this.providers.get(id);
	}
}

