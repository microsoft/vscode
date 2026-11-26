/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';

export const ISessionsListUndoService = createDecorator<ISessionsListUndoService>('sessionsListUndoService');

/**
 * A change the user made from the sessions list, such as marking sessions done, which the list's notice offers to undo
 * for a while. The caller makes the change; a change that can't be reverted once made, such as deleting sessions, stays
 * provisional until Undo is no longer offered for it, and then {@link commit}s.
 */
export interface ISessionsListChange {
	/**
	 * The kind of change, such as marking sessions done. A change joins the notice that offers to undo changes of the
	 * same kind, which then counts them all and undoes them all; a change of another kind replaces the notice.
	 */
	readonly kind: string;
	/** How many items the change affected. */
	readonly count: number;
	/** Summarizes changes of this kind to `count` items, such as "3 marked done". */
	message(count: number): string;
	/** Tells accessibility help readers what led to the notice and what Undo restores. */
	readonly help: string;
	/** Whether the notice shows its Undo expiry bar. Defaults to true. */
	readonly showCountdown?: boolean;
	/** Reverts the change. A failure is reported and leaves Undo available to try again. */
	undo(): Promise<void>;
	/**
	 * Completes the change once Undo is no longer offered for it: its notice expires, is dismissed or replaced, or the
	 * window closes, which waits for it. Where Undo can't be offered for it, it runs right away: without a visible sessions
	 * list, and in the web, which can't wait for it as the page unloads. A failure is reported.
	 */
	commit?(): Promise<void>;
}

/** What the notice of a sessions list shows; see {@link ISessionsListUndoPresenter}. */
export interface ISessionsListNotice {
	/** A short summary of the change, such as "3 marked done". */
	readonly message: string;
	/** Tells accessibility help readers what led to the notice and, with {@link undo}, what Undo restores. */
	readonly help: string;
	/** Whether to show the Undo expiry bar. Defaults to true. */
	readonly showCountdown?: boolean;
	/**
	 * Reverts the change; without it, the notice only reports. A failure is reported and leaves Undo available to try
	 * again. It may replace the notice, e.g. with its own result.
	 */
	undo?(): Promise<void>;
	/** Called once the notice closes: it expires, is dismissed or replaced, or its list goes away. */
	onDidClose?(): void;
}

/** A notice that a sessions list shows. */
export interface ISessionsListNoticeHandle {
	/** Shows `message` instead and restarts the countdown, as when another change joins the notice. */
	update(message: string): void;
	/** Closes the notice, unless it is closed already. */
	close(): void;
}

/** Shows the notice of a sessions list, which offers Undo for the changes of {@link ISessionsListUndoService}. */
export interface ISessionsListUndoPresenter {
	/** Whether the user can see its notice, such as while its view is expanded in a visible part of the window. */
	isVisible(): boolean;
	/** Shows `notice` in place of the notice shown before, which closes. */
	show(notice: ISessionsListNotice): ISessionsListNoticeHandle;
}

/**
 * Offers Undo for changes made from the sessions list, in the list's notice, and completes them once it no longer does.
 */
export interface ISessionsListUndoService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether {@link offerUndo} would now offer Undo for a change, rather than complete it right away, so that a caller can
	 * tell the user before making it, such as in a confirmation. `commits` says whether the change
	 * {@link ISessionsListChange.commit}s once Undo is no longer offered.
	 */
	canOfferUndo(options?: { readonly commits?: boolean }): boolean;

	/**
	 * Offers to undo `change`, which the caller has made. Returns false when it can't ({@link canOfferUndo}): the change
	 * is then complete, its {@link ISessionsListChange.commit} already running.
	 */
	offerUndo(change: ISessionsListChange): boolean;

	/** Lets `presenter` show what Undo is offered for, until disposed. The latest registered visible presenter shows it. */
	registerPresenter(presenter: ISessionsListUndoPresenter): IDisposable;
}

/** Changes that one notice offers to undo. */
interface IUndoableChanges {
	readonly kind: string;
	readonly presenter: ISessionsListUndoPresenter;
	/** The changes Undo reverts, latest last; what is left of them completes once Undo is no longer offered. */
	readonly changes: ISessionsListChange[];
	count: number;
	handle: ISessionsListNoticeHandle | undefined;
	undoing: boolean;
	ended: boolean;
}

export class SessionsListUndoService extends Disposable implements ISessionsListUndoService {

	declare readonly _serviceBrand: undefined;

	private readonly presenters: ISessionsListUndoPresenter[] = [];
	private current: IUndoableChanges | undefined;
	/** Commits that have not settled yet, which closing the window waits for. */
	private readonly pendingCommits = new Set<Promise<void>>();

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		this._register(lifecycleService.onWillShutdown(event => {
			// Closing the window ends Undo, so complete what it could have reverted before the window goes.
			if (this.current) {
				this.end(this.current);
			}
			if (this.pendingCommits.size > 0) {
				event.join(Promise.allSettled(this.pendingCommits).then(() => undefined), {
					id: 'join.sessionsListUndo',
					label: localize('join.sessionsListUndo', "Completing changes in the sessions list"),
				});
			}
		}));
	}

	canOfferUndo(options?: { readonly commits?: boolean }): boolean {
		return !!this.presenterFor(!!options?.commits);
	}

	offerUndo(change: ISessionsListChange): boolean {
		const presenter = this.presenterFor(!!change.commit);
		if (!presenter) {
			this.complete([change]);
			return false;
		}
		const current = this.current;
		if (current && current.presenter === presenter && current.kind === change.kind && !current.undoing) {
			current.changes.push(change);
			current.count += change.count;
			current.handle?.update(change.message(current.count));
			return true;
		}
		if (current) {
			this.end(current);
		}
		const entry: IUndoableChanges = { kind: change.kind, presenter, changes: [change], count: change.count, handle: undefined, undoing: false, ended: false };
		this.current = entry;
		entry.handle = presenter.show({
			message: change.message(change.count),
			help: change.help,
			showCountdown: change.showCountdown,
			undo: () => this.undo(entry),
			onDidClose: () => this.end(entry),
		});
		return true;
	}

	registerPresenter(presenter: ISessionsListUndoPresenter): IDisposable {
		this.presenters.push(presenter);
		return toDisposable(() => {
			const index = this.presenters.indexOf(presenter);
			if (index >= 0) {
				this.presenters.splice(index, 1);
			}
			if (this.current?.presenter === presenter) {
				this.end(this.current);
			}
		});
	}

	/** Where Undo for a change can be offered: the latest registered presenter the user can see, if any. */
	private presenterFor(commits: boolean): ISessionsListUndoPresenter | undefined {
		// The web can't wait for a change to complete as the page unloads, and leaving the page may be cancelled, so a
		// change that completes once Undo ends, such as deleting sessions, completes right away there instead.
		if (commits && isWeb) {
			return undefined;
		}
		return this.presenters.findLast(presenter => presenter.isVisible());
	}

	private async undo(entry: IUndoableChanges): Promise<void> {
		entry.undoing = true;
		try {
			// Latest first, each change once: a failure leaves it and the earlier ones to undo again.
			while (entry.changes.length > 0) {
				const change = entry.changes.pop()!;
				try {
					await change.undo();
				} catch (error) {
					if (entry.ended) {
						// Replaced while undoing: nothing offers Undo for it anymore.
						this.complete([change]);
					} else {
						entry.changes.push(change);
					}
					throw error;
				}
			}
		} finally {
			entry.undoing = false;
		}
	}

	/** Stops offering Undo for `entry`, closing its notice, and completes what is left of its changes. */
	private end(entry: IUndoableChanges): void {
		if (entry.ended) {
			return;
		}
		entry.ended = true;
		if (this.current === entry) {
			this.current = undefined;
		}
		entry.handle?.close();
		this.complete(entry.changes.splice(0));
	}

	/** Completes `changes`, which can no longer be undone, reporting failures. */
	private complete(changes: readonly ISessionsListChange[]): void {
		for (const change of changes) {
			if (change.commit) {
				const commit = change.commit().catch(error => this.notificationService.error(error));
				this.pendingCommits.add(commit);
				commit.finally(() => this.pendingCommits.delete(commit));
			}
		}
	}
}
