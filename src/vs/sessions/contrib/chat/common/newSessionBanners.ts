/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { AgentsWindowUsage } from '../../../../workbench/contrib/chat/common/agentsWindowUsage.js';

/** The number of sessions a user must have started in the Agents window before any banner shows below the new-session input. */
export const NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS = 3;

/**
 * The priorities of the banners below the new-session input. Of the banners that want to show, only the one with the
 * highest priority shows. The values leave room for new banners between existing ones.
 */
export const enum NewSessionBannerPriority {
	/** A getting-started tip, including contextual tips such as connector recommendations. */
	Tip = 100,
	/** The notice that agent customizations need to be migrated. */
	Migration = 200,
	/** The suggestion to start the session in a new worktree, because its folder has uncommitted changes. */
	WorktreeSuggestion = 300,
}

export interface INewSessionBannerOptions {
	/**
	 * Whether the banner shows as a developer preview, the only way a banner can show before the user started
	 * {@link NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS} sessions.
	 */
	readonly isDeveloperPreview?: IObservable<boolean>;
}

/** A banner registered with {@link NewSessionBanners}. Disposing it unregisters the banner. */
export interface INewSessionBanner extends IDisposable {
	/** Whether this is the banner that shows. A banner renders only while this is `true`. */
	readonly isShowing: IObservable<boolean>;
}

interface IBannerRegistration extends INewSessionBannerOptions {
	readonly priority: number;
	readonly wantsToShow: IObservable<boolean>;
}

/**
 * Makes the banners below the new-session input show one at a time, and only once the user started
 * {@link NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS} sessions. Each banner registers with a priority and an observable of
 * its own conditions to show, and renders only while it is the banner that shows: the one with the highest priority of
 * those that want to show. Of banners with the same priority, the one registered first shows.
 */
export class NewSessionBanners extends Disposable {

	private readonly _registrations = observableValue<readonly IBannerRegistration[]>(this, []);
	private readonly _hasEnoughSessions: IObservable<boolean>;

	/** Reads the conditions of banners in priority order, up to the first that shows. */
	private readonly _showing = derived<IBannerRegistration | undefined>(this, reader => {
		const hasEnoughSessions = this._hasEnoughSessions.read(reader);
		// Sorting is stable, so banners of the same priority stay in registration order.
		const byPriority = [...this._registrations.read(reader)].sort((a, b) => b.priority - a.priority);
		return byPriority.find(registration => (hasEnoughSessions || registration.isDeveloperPreview?.read(reader)) && registration.wantsToShow.read(reader));
	});

	constructor(@IStorageService storageService: IStorageService) {
		super();
		const usage = new AgentsWindowUsage(storageService);
		this._hasEnoughSessions = observableFromEvent(this, usage.onDidChangeCreatedSessionCount(this._store), () => usage.createdSessionCount >= NEW_SESSION_BANNERS_MIN_CREATED_SESSIONS);
	}

	/**
	 * Registers a banner with a priority from {@link NewSessionBannerPriority}. `wantsToShow` reflects only the banner's
	 * own conditions, never whether this or another banner shows, nor how many sessions the user started.
	 */
	register(priority: number, wantsToShow: IObservable<boolean>, options?: INewSessionBannerOptions): INewSessionBanner {
		const registration: IBannerRegistration = { priority, wantsToShow, isDeveloperPreview: options?.isDeveloperPreview };
		this._registrations.set([...this._registrations.get(), registration], undefined);
		const unregister = toDisposable(() => this._registrations.set(this._registrations.get().filter(candidate => candidate !== registration), undefined));
		return {
			isShowing: derived(this, reader => this._showing.read(reader) === registration),
			dispose: () => unregister.dispose(),
		};
	}
}
