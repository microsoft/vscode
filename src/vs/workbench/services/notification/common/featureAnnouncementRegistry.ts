/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../base/common/themables.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

/**
 * Describes a single feature item within an announcement.
 * Used for declarative registration.
 */
export interface IFeatureItemDescriptor {
	/**
	 * Icon for the feature. Can be a codicon ID string (e.g., 'play', 'list-flat')
	 * or a ThemeIcon instance.
	 */
	readonly icon: string | ThemeIcon;

	/**
	 * Title of the feature.
	 */
	readonly title: string;

	/**
	 * Description of the feature.
	 */
	readonly description: string;
}

/**
 * Describes a feature announcement for declarative registration.
 *
 * Feature announcements are rich notifications that appear when VS Code
 * has new features to highlight. They show in both a toast and the
 * notification center.
 *
 * @example
 * ```typescript
 * Registry.as<IFeatureAnnouncementRegistry>(Extensions.FeatureAnnouncements)
 *     .registerAnnouncement({
 *         id: 'my-feature-v1',
 *         category: 'NEW IN VS CODE',
 *         title: 'My Feature',
 *         minVersion: '1.96.0',
 *         features: [
 *             { icon: 'play', title: 'Feature One', description: 'Description...' }
 *         ],
 *         learnMoreUrl: 'https://code.visualstudio.com/docs/...',
 *         primaryActionLabel: 'Try It Now',
 *         primaryActionCommandId: 'myExtension.myCommand'
 *     });
 * ```
 */
export interface IFeatureAnnouncementDescriptor {
	/**
	 * Unique identifier for the announcement.
	 * Used for tracking dismissal state. Include a version suffix
	 * (e.g., 'my-feature-v1') to allow reshowing for major updates.
	 */
	readonly id: string;

	/**
	 * Category label shown above the title (e.g., "NEW IN VS CODE").
	 */
	readonly category: string;

	/**
	 * Main title of the announcement (e.g., "Agent Sessions").
	 */
	readonly title: string;

	/**
	 * List of features to display. Each feature has an icon, title, and description.
	 */
	readonly features: readonly IFeatureItemDescriptor[];

	/**
	 * Optional URL for "Full Release Notes" link.
	 */
	readonly learnMoreUrl?: string;

	/**
	 * Optional label for the primary action button.
	 */
	readonly primaryActionLabel?: string;

	/**
	 * Optional command ID to execute when the primary action is clicked.
	 * Used with primaryActionLabel.
	 */
	readonly primaryActionCommandId?: string;

	/**
	 * Optional: Minimum VS Code version to show this announcement.
	 * Format: 'major.minor.patch' (e.g., '1.96.0')
	 */
	readonly minVersion?: string;

	/**
	 * Optional: Maximum VS Code version to show this announcement.
	 * The announcement won't appear in versions after this.
	 * Format: 'major.minor.patch' (e.g., '1.97.0')
	 */
	readonly maxVersion?: string;

	/**
	 * Optional: Only show on first window focus after update.
	 * Defaults to true.
	 */
	readonly showOnFirstFocusOnly?: boolean;
}

/**
 * Registry for feature announcements.
 * Use this to declaratively register announcements that will be shown
 * to users when appropriate.
 */
export interface IFeatureAnnouncementRegistry {
	/**
	 * Register a feature announcement.
	 * The announcement will be shown based on version constraints
	 * and whether the user has previously dismissed it.
	 *
	 * @param descriptor The announcement descriptor
	 */
	registerAnnouncement(descriptor: IFeatureAnnouncementDescriptor): void;

	/**
	 * Get all registered announcements.
	 */
	getAnnouncements(): readonly IFeatureAnnouncementDescriptor[];

	/**
	 * Get a specific announcement by ID.
	 */
	getAnnouncement(id: string): IFeatureAnnouncementDescriptor | undefined;
}

class FeatureAnnouncementRegistry implements IFeatureAnnouncementRegistry {

	private readonly announcements = new Map<string, IFeatureAnnouncementDescriptor>();

	registerAnnouncement(descriptor: IFeatureAnnouncementDescriptor): void {
		if (this.announcements.has(descriptor.id)) {
			console.warn(`[FeatureAnnouncementRegistry] Announcement with id '${descriptor.id}' is already registered`);
			return;
		}
		this.announcements.set(descriptor.id, descriptor);
	}

	getAnnouncements(): readonly IFeatureAnnouncementDescriptor[] {
		return Array.from(this.announcements.values());
	}

	getAnnouncement(id: string): IFeatureAnnouncementDescriptor | undefined {
		return this.announcements.get(id);
	}
}

/**
 * Extension point identifiers for feature announcement registry.
 */
export const Extensions = {
	FeatureAnnouncements: 'workbench.registry.featureAnnouncements'
};

// Register the feature announcements registry
Registry.add(Extensions.FeatureAnnouncements, new FeatureAnnouncementRegistry());
