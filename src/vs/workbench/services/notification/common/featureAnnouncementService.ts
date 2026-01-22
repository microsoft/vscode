/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import {
	IFeatureAnnouncementService,
	IFeatureAnnouncement,
	IFeatureAnnouncementHandle,
	IFeatureAnnouncementChangeEvent,
	FeatureAnnouncementChangeType
} from './featureAnnouncement.js';

class FeatureAnnouncementHandle extends Disposable implements IFeatureAnnouncementHandle {
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	constructor(
		private readonly announcement: IFeatureAnnouncement,
		private readonly onCloseCallback: (announcement: IFeatureAnnouncement) => void
	) {
		super();
	}

	close(): void {
		this.onCloseCallback(this.announcement);
		this._onDidClose.fire();
		this.dispose();
	}
}

export class FeatureAnnouncementService extends Disposable implements IFeatureAnnouncementService {

	declare readonly _serviceBrand: undefined;

	private static readonly DISMISSED_ANNOUNCEMENTS_KEY = 'featureAnnouncements.dismissed';

	private readonly _onDidChangeAnnouncements = this._register(new Emitter<IFeatureAnnouncementChangeEvent>());
	readonly onDidChangeAnnouncements = this._onDidChangeAnnouncements.event;

	private readonly _announcements: IFeatureAnnouncement[] = [];
	private readonly dismissedAnnouncements: Set<string>;

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		// Load dismissed announcements from storage
		this.dismissedAnnouncements = new Set(
			this.storageService.getObject<string[]>(
				FeatureAnnouncementService.DISMISSED_ANNOUNCEMENTS_KEY,
				StorageScope.APPLICATION,
				[]
			)
		);
	}

	get announcements(): readonly IFeatureAnnouncement[] {
		return this._announcements;
	}

	show(announcement: IFeatureAnnouncement): IFeatureAnnouncementHandle {
		// Don't show if already dismissed
		if (this.isAnnouncementDismissed(announcement.id)) {
			return new FeatureAnnouncementHandle(announcement, () => { });
		}

		// Don't show duplicates
		const existing = this._announcements.find(a => a.id === announcement.id);
		if (existing) {
			return new FeatureAnnouncementHandle(announcement, () => this.closeAnnouncement(announcement));
		}

		// Add announcement
		this._announcements.push(announcement);

		// Fire event
		this._onDidChangeAnnouncements.fire({
			announcement,
			kind: FeatureAnnouncementChangeType.ADD
		});

		// Return handle
		return new FeatureAnnouncementHandle(announcement, () => this.closeAnnouncement(announcement));
	}

	private closeAnnouncement(announcement: IFeatureAnnouncement): void {
		const index = this._announcements.findIndex(a => a.id === announcement.id);
		if (index === -1) {
			return;
		}

		// Remove from list
		this._announcements.splice(index, 1);

		// Mark as dismissed
		this.dismissedAnnouncements.add(announcement.id);
		this.saveDismissedAnnouncements();

		// Fire event
		this._onDidChangeAnnouncements.fire({
			announcement,
			kind: FeatureAnnouncementChangeType.REMOVE
		});
	}

	isAnnouncementDismissed(id: string): boolean {
		return this.dismissedAnnouncements.has(id);
	}

	close(id: string): void {
		const announcement = this._announcements.find(a => a.id === id);
		if (announcement) {
			this.closeAnnouncement(announcement);
		}
	}

	private saveDismissedAnnouncements(): void {
		this.storageService.store(
			FeatureAnnouncementService.DISMISSED_ANNOUNCEMENTS_KEY,
			JSON.stringify([...this.dismissedAnnouncements]),
			StorageScope.APPLICATION,
			StorageTarget.USER
		);
	}
}

registerSingleton(IFeatureAnnouncementService, FeatureAnnouncementService, InstantiationType.Delayed);
