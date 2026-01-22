/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';

export const IFeatureAnnouncementService = createDecorator<IFeatureAnnouncementService>('featureAnnouncementService');

/**
 * Represents a single feature item within an announcement.
 */
export interface IFeatureItem {
	/**
	 * Icon to display for the feature.
	 */
	readonly icon: ThemeIcon;

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
 * Represents a feature announcement with structured content.
 */
export interface IFeatureAnnouncement {
	/**
	 * Unique identifier for the announcement.
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
	 * List of features to display.
	 */
	readonly features: IFeatureItem[];

	/**
	 * Optional URL for "Learn More" link.
	 */
	readonly learnMoreUrl?: string;

	/**
	 * Optional primary action button.
	 */
	readonly primaryAction?: IFeatureAnnouncementAction;
}

export interface IFeatureAnnouncementAction {
	/**
	 * Label for the action button.
	 */
	readonly label: string;

	/**
	 * Function to run when the action is triggered.
	 */
	run(): void;
}

export interface IFeatureAnnouncementHandle extends IDisposable {
	/**
	 * Fired when the announcement is closed.
	 */
	readonly onDidClose: Event<void>;

	/**
	 * Close the announcement.
	 */
	close(): void;
}

export const enum FeatureAnnouncementChangeType {
	ADD,
	REMOVE
}

export interface IFeatureAnnouncementChangeEvent {
	readonly announcement: IFeatureAnnouncement;
	readonly kind: FeatureAnnouncementChangeType;
}

/**
 * Service for showing structured feature announcements.
 * These appear as rich cards in the corner of the screen and
 * integrate with the notification bell in the status bar.
 */
export interface IFeatureAnnouncementService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when announcements change.
	 */
	readonly onDidChangeAnnouncements: Event<IFeatureAnnouncementChangeEvent>;

	/**
	 * Get all currently visible announcements.
	 */
	readonly announcements: readonly IFeatureAnnouncement[];

	/**
	 * Show a feature announcement.
	 * @param announcement The announcement to show.
	 * @returns A handle to control the announcement.
	 */
	show(announcement: IFeatureAnnouncement): IFeatureAnnouncementHandle;

	/**
	 * Close an announcement by ID.
	 * @param id The announcement ID.
	 */
	close(id: string): void;

	/**
	 * Check if an announcement with the given ID has been dismissed.
	 * @param id The announcement ID.
	 */
	isAnnouncementDismissed(id: string): boolean;
}
