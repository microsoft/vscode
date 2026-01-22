/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Import to ensure announcements are registered before the contribution runs
import './featureAnnouncements.js';

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IFeatureAnnouncementService, IFeatureAnnouncement } from '../../../services/notification/common/featureAnnouncement.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import {
	Extensions,
	IFeatureAnnouncementRegistry,
	IFeatureAnnouncementDescriptor
} from '../../../services/notification/common/featureAnnouncementRegistry.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';

/**
 * Contribution that processes registered feature announcements
 * and shows them when appropriate based on version and dismissal state.
 */
export class FeatureAnnouncementContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.featureAnnouncement';

	private static readonly STORAGE_KEY_PREFIX = 'featureAnnouncement.shown.';
	private static readonly LAST_VERSION_KEY = 'featureAnnouncement.lastVersion';

	private static readonly FORCE_SHOW_FOR_TESTING = false;

	constructor(
		@IFeatureAnnouncementService private readonly featureAnnouncementService: IFeatureAnnouncementService,
		@IStorageService private readonly storageService: IStorageService,
		@IHostService private readonly hostService: IHostService,
		@ICommandService private readonly commandService: ICommandService,
		@IProductService private readonly productService: IProductService
	) {
		super();

		this.processAnnouncements();
	}

	private async processAnnouncements(): Promise<void> {
		// Only show on first window focus (unless testing)
		if (!FeatureAnnouncementContribution.FORCE_SHOW_FOR_TESTING) {
			if (!await this.hostService.hadLastFocus()) {
				return;
			}
		}

		// Get the previous version and store the current version
		const currentVersion = this.productService.version;
		const previousVersion = this.storageService.get(FeatureAnnouncementContribution.LAST_VERSION_KEY, StorageScope.APPLICATION);
		this.storageService.store(FeatureAnnouncementContribution.LAST_VERSION_KEY, currentVersion, StorageScope.APPLICATION, StorageTarget.MACHINE);

		const registry = Registry.as<IFeatureAnnouncementRegistry>(Extensions.FeatureAnnouncements);
		const descriptors = registry.getAnnouncements();

		for (const descriptor of descriptors) {
			if (this.shouldShowAnnouncement(descriptor, previousVersion)) {
				this.showAnnouncement(descriptor);
			}
		}
	}

	/**
	 * Determines if an announcement should be shown based on:
	 * - Version update (announcement applies to this specific update)
	 * - Version constraints (minVersion, maxVersion)
	 * - Dismissal state
	 */
	private shouldShowAnnouncement(descriptor: IFeatureAnnouncementDescriptor, previousVersion: string | undefined): boolean {
		// Always show when testing
		if (FeatureAnnouncementContribution.FORCE_SHOW_FOR_TESTING) {
			return true;
		}

		// Check if already dismissed
		const storageKey = FeatureAnnouncementContribution.STORAGE_KEY_PREFIX + descriptor.id;
		if (this.storageService.getBoolean(storageKey, StorageScope.APPLICATION, false)) {
			return false;
		}

		// Check if dismissed through the service
		if (this.featureAnnouncementService.isAnnouncementDismissed(descriptor.id)) {
			return false;
		}

		// Check if this announcement applies to the current update
		const currentVersion = this.productService.version;
		if (!this.isVersionInRange(currentVersion, descriptor.minVersion, descriptor.maxVersion)) {
			return false;
		}

		// Only show if this is a new update that introduces the feature
		// (previous version was below minVersion, current version is at or above minVersion)
		if (previousVersion && descriptor.minVersion) {
			const prevParts = this.parseVersion(previousVersion);
			const minParts = this.parseVersion(descriptor.minVersion);
			if (prevParts && minParts) {
				// Only show if previous version was below minVersion
				if (this.compareVersions(prevParts, minParts) >= 0) {
					return false; // User already had this feature
				}
			}
		}

		return true;
	}

	/**
	 * Checks if the current version is within the specified range.
	 */
	private isVersionInRange(current: string, min?: string, max?: string): boolean {
		if (!min && !max) {
			return true;
		}

		const currentParts = this.parseVersion(current);
		if (!currentParts) {
			return true; // Can't parse, allow it
		}

		if (min) {
			const minParts = this.parseVersion(min);
			if (minParts && this.compareVersions(currentParts, minParts) < 0) {
				return false;
			}
		}

		if (max) {
			const maxParts = this.parseVersion(max);
			if (maxParts && this.compareVersions(currentParts, maxParts) > 0) {
				return false;
			}
		}

		return true;
	}

	private parseVersion(version: string): number[] | null {
		const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
		if (!match) {
			return null;
		}
		return [
			parseInt(match[1], 10),
			parseInt(match[2], 10),
			parseInt(match[3] || '0', 10)
		];
	}

	private compareVersions(a: number[], b: number[]): number {
		for (let i = 0; i < 3; i++) {
			if (a[i] < b[i]) {
				return -1;
			}
			if (a[i] > b[i]) {
				return 1;
			}
		}
		return 0;
	}

	/**
	 * Converts a descriptor to an announcement and shows it.
	 */
	private showAnnouncement(descriptor: IFeatureAnnouncementDescriptor): void {
		const announcement: IFeatureAnnouncement = {
			id: descriptor.id,
			category: descriptor.category,
			title: descriptor.title,
			features: descriptor.features.map(f => ({
				icon: typeof f.icon === 'string' ? this.resolveIcon(f.icon) : f.icon,
				title: f.title,
				description: f.description
			})),
			learnMoreUrl: descriptor.learnMoreUrl,
			primaryAction: descriptor.primaryActionLabel && descriptor.primaryActionCommandId ? {
				label: descriptor.primaryActionLabel,
				run: () => {
					this.commandService.executeCommand(descriptor.primaryActionCommandId!);
				}
			} : undefined
		};

		const handle = this.featureAnnouncementService.show(announcement);
		this._register(handle);

		// Mark as shown when closed
		this._register(handle.onDidClose(() => {
			const storageKey = FeatureAnnouncementContribution.STORAGE_KEY_PREFIX + descriptor.id;
			this.storageService.store(storageKey, true, StorageScope.APPLICATION, StorageTarget.USER);
		}));
	}

	/**
	 * Resolves an icon name string to a ThemeIcon.
	 */
	private resolveIcon(iconName: string): ThemeIcon {
		// Check if it's a known Codicon
		const codicon = (Codicon as Record<string, ThemeIcon>)[iconName] ||
			(Codicon as Record<string, ThemeIcon>)[this.toCamelCase(iconName)];
		if (codicon) {
			return codicon;
		}
		// Fall back to creating a ThemeIcon with the name
		return ThemeIcon.fromId(iconName);
	}

	private toCamelCase(str: string): string {
		return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
	}
}
