/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IResourceUndoRedoElement, IUndoRedoService, UndoRedoElementType } from '../../../../platform/undoRedo/common/undoRedo.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';

export const ISessionsListUndoService = createDecorator<ISessionsListUndoService>('sessionsListUndoService');

/**
 * A change the user made from the sessions list, such as marking sessions done. It becomes a step of the window's
 * Undo and Redo, while the sessions list has focus, and the list's notice offers to undo it for a while. The caller
 * makes the change; a change that can't be reverted once made, such as deleting sessions, stays provisional until the
 * notice no longer offers Undo for it, and then {@link commit}s.
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
	/** Reverts the change. A failure is reported and ends the sessions list's undo history. */
	undo(): Promise<void>;
	/** Makes the change again once it was undone. A failure is reported and ends the sessions list's undo history. */
	redo(): Promise<void>;
	/**
	 * Whether the list changed since the change was made (`applied`) or undone (not `applied`) in a way that keeps
	 * undoing or redoing it from restoring what the user expects, such as a session it marked done having been restored
	 * since. Checked before each Undo and Redo: a conflict ends the sessions list's undo history there instead.
	 */
	conflicts?(applied: boolean): boolean;
	/**
	 * Completes the change once the notice no longer offers Undo for it: the notice expires, is dismissed or replaced,
	 * or the window closes, which waits for it; in the web, which can't wait, leaving the page asks to stay until it
	 * completes. Without a sessions list to offer Undo, it runs right away. The change can't be undone once complete,
	 * so the list's undo history ends at it. A failure is reported.
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
	/** Shows `notice` in place of the notice shown before, which closes. */
	show(notice: ISessionsListNotice): ISessionsListNoticeHandle;
}

/**
 * Records the changes made from the sessions list on the window's undo stack, offers Undo for the latest in the list's
 * notice, and completes the provisional ones once the notice no longer does.
 */
export interface ISessionsListUndoService {
	readonly _serviceBrand: undefined;

	/**
	 * Records `change`, which the caller has made, and offers to undo it in the notice of the sessions list. Returns
	 * false when no sessions list shows notices: the change is then complete, its {@link ISessionsListChange.commit}
	 * already running, and not recorded.
	 */
	offerUndo(change: ISessionsListChange): boolean;

	/** Lets `presenter` show what Undo is offered for, until disposed. The latest registered presenter shows it. */
	registerPresenter(presenter: ISessionsListUndoPresenter): IDisposable;

	/** Whether Undo has a change made from the sessions list to revert. */
	canUndo(): boolean;

	/**
	 * Reverts the latest change made from the sessions list. When the list changed since in a way that conflicts with
	 * it, or it is complete, the list's undo history ends there instead, and the notice says why.
	 */
	undo(): Promise<void>;

	/** Whether Redo has an undone change made from the sessions list to make again. */
	canRedo(): boolean;

	/**
	 * Makes the latest undone change again and offers to undo it in the notice. When the list changed since in a way that
	 * conflicts with it, the list's undo history ends there instead, and the notice says why.
	 */
	redo(): Promise<void>;
}

/** The resource of the window's undo stack that holds the changes made from the sessions list. */
const SESSIONS_LIST_UNDO_RESOURCE = URI.from({ scheme: 'vscode-sessions-list', path: '/changes' });

/** A change on the window's undo stack. */
class SessionsListUndoElement implements IResourceUndoRedoElement {

	readonly type = UndoRedoElementType.Resource;
	readonly resource = SESSIONS_LIST_UNDO_RESOURCE;
	readonly code: string;
	readonly label: string;
	/** Whether the change is in effect: made or redone, and not undone since. */
	applied = true;
	/** Whether the change is complete, so that it can no longer be undone. */
	committed = false;

	constructor(readonly change: ISessionsListChange) {
		this.code = `sessionsList.${change.kind}`;
		this.label = change.message(change.count);
	}

	async undo(): Promise<void> {
		await this.change.undo();
		this.applied = false;
	}

	async redo(): Promise<void> {
		await this.change.redo();
		this.applied = true;
	}
}

/** The changes that one notice offers to undo. */
interface INoticeEntry {
	readonly kind: string;
	readonly presenter: ISessionsListUndoPresenter;
	/** The changes, latest last: the latest on the undo stack. */
	readonly elements: SessionsListUndoElement[];
	handle: ISessionsListNoticeHandle | undefined;
	/** Whether the notice's Undo is reverting its changes. */
	undoing: boolean;
	ended: boolean;
}

export class SessionsListUndoService extends Disposable implements ISessionsListUndoService {

	declare readonly _serviceBrand: undefined;

	private readonly presenters: ISessionsListUndoPresenter[] = [];
	private current: INoticeEntry | undefined;
	/** Commits that have not settled yet, which closing the window waits for. */
	private readonly pendingCommits = new Set<Promise<void>>();
	/** Runs one undo or redo at a time, as the undo stack takes only one at a time. */
	private readonly sequencer = new Sequencer();

	constructor(
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
		@INotificationService private readonly notificationService: INotificationService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
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
		if (isWeb) {
			// The web can't wait for changes to complete as the page unloads, so end Undo as leaving begins and ask the browser
			// to keep the page while what Undo was offered for completes, as for files that are being saved.
			this._register(lifecycleService.onBeforeShutdown(event => {
				if (this.current) {
					this.end(this.current);
				}
				event.veto(this.pendingCommits.size > 0, 'veto.sessionsListUndo');
			}));
		}
	}

	offerUndo(change: ISessionsListChange): boolean {
		const presenter = this.presenters.at(-1);
		if (!presenter) {
			this.runCommit(change);
			return false;
		}
		const element = new SessionsListUndoElement(change);
		this.undoRedoService.pushElement(element);
		this.present(element, presenter);
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

	canUndo(): boolean {
		return !!this.getNext('past');
	}

	canRedo(): boolean {
		return !!this.getNext('future');
	}

	undo(): Promise<void> {
		return this.sequencer.queue(async () => {
			const element = this.getNext('past');
			if (element && this.canChange(element)) {
				await this.undoElement(element);
			}
		});
	}

	redo(): Promise<void> {
		return this.sequencer.queue(async () => {
			const element = this.getNext('future');
			if (element && this.canChange(element) && await this.step(element, 'redo')) {
				const presenter = this.presenters.at(-1);
				if (presenter) {
					this.present(element, presenter);
				} else if (element.change.commit) {
					this.commit(element);
				}
			}
		});
	}

	/** The change that Undo (`past`) or Redo (`future`) would take next. */
	private getNext(direction: 'past' | 'future'): SessionsListUndoElement | undefined {
		const element = this.undoRedoService.getElements(SESSIONS_LIST_UNDO_RESOURCE)[direction].at(-1);
		return element instanceof SessionsListUndoElement ? element : undefined;
	}

	/** Whether `element` can still be undone, or redone; if not, ends the list's undo history and tells why. */
	private canChange(element: SessionsListUndoElement): boolean {
		let reason: string | undefined;
		if (element.committed) {
			reason = localize('sessionsListUndoCommitted', "Can't undo \"{0}\" anymore", element.label);
		} else if (element.change.conflicts?.(element.applied)) {
			reason = element.applied
				? localize('sessionsListUndoConflict', "Can't undo \"{0}\": the sessions list changed since", element.label)
				: localize('sessionsListRedoConflict', "Can't redo \"{0}\": the sessions list changed since", element.label);
		}
		if (reason === undefined) {
			return true;
		}
		this.undoRedoService.removeElements(SESSIONS_LIST_UNDO_RESOURCE);
		if (this.current) {
			this.end(this.current);
		}
		this.presenters.at(-1)?.show({
			message: reason,
			help: localize('sessionsListUndoEndedHelp', "Undo and Redo in the sessions list stopped at this change, because undoing or redoing it could no longer restore what it changed. Changes made from now on can be undone again."),
		});
		return false;
	}

	/** Undoes or redoes `element`, the next change on the undo stack; returns whether it did. A failure drops the list's undo history. */
	private async step(element: SessionsListUndoElement, direction: 'undo' | 'redo'): Promise<boolean> {
		const applied = element.applied;
		await (direction === 'undo' ? this.undoRedoService.undo(SESSIONS_LIST_UNDO_RESOURCE) : this.undoRedoService.redo(SESSIONS_LIST_UNDO_RESOURCE));
		return element.applied !== applied;
	}

	/** Undoes `element`, the latest change on the undo stack, and takes it out of the notice that offers to undo it. */
	private async undoElement(element: SessionsListUndoElement): Promise<boolean> {
		const entry = this.current?.elements.includes(element) ? this.current : undefined;
		// Out of the notice while it is undone, so that ending the notice meanwhile does not complete it.
		entry?.elements.splice(entry.elements.indexOf(element), 1);
		if (!await this.step(element, 'undo')) {
			// The failure was reported and nothing can undo the change anymore.
			if (entry) {
				this.end(entry);
			}
			if (element.change.commit) {
				this.commit(element);
			}
			return false;
		}
		if (entry && !entry.ended) {
			if (entry.elements.length === 0) {
				this.end(entry);
			} else if (!entry.undoing) {
				entry.handle?.update(this.getMessage(entry));
			}
		}
		return true;
	}

	/** Undoes the changes of `entry`, its notice's Undo, latest first. */
	private undoEntry(entry: INoticeEntry): Promise<void> {
		return this.sequencer.queue(async () => {
			entry.undoing = true;
			try {
				while (!entry.ended && entry.elements.length > 0) {
					const element = entry.elements.at(-1)!;
					if (this.getNext('past') !== element || !this.canChange(element) || !await this.undoElement(element)) {
						return;
					}
				}
			} finally {
				entry.undoing = false;
			}
		});
	}

	/** Offers to undo `element` in the notice of `presenter`, joining the notice that offers to undo changes of its kind. */
	private present(element: SessionsListUndoElement, presenter: ISessionsListUndoPresenter): void {
		const current = this.current;
		if (current && current.presenter === presenter && current.kind === element.change.kind && !current.undoing) {
			current.elements.push(element);
			current.handle?.update(this.getMessage(current));
			return;
		}
		if (current) {
			this.end(current);
		}
		const entry: INoticeEntry = { kind: element.change.kind, presenter, elements: [element], handle: undefined, undoing: false, ended: false };
		this.current = entry;
		entry.handle = presenter.show({
			message: this.getMessage(entry),
			help: this.getHelp(element.change),
			showCountdown: element.change.showCountdown,
			undo: () => this.undoEntry(entry),
			onDidClose: () => this.end(entry),
		});
	}

	private getMessage(entry: INoticeEntry): string {
		const count = entry.elements.reduce((total, element) => total + element.change.count, 0);
		return entry.elements.at(-1)!.change.message(count);
	}

	private getHelp(change: ISessionsListChange): string {
		if (change.commit) {
			return change.help;
		}
		const keybinding = this.keybindingService.lookupKeybinding('undo')?.getLabel();
		return keybinding
			? localize('sessionsListUndoLaterHelp', "{0} Once the notice is gone, {1} still undoes the change while the sessions list has focus, unless the list changed since in a way that conflicts with it.", change.help, keybinding)
			: localize('sessionsListUndoLaterHelpEditMenu', "{0} Once the notice is gone, Undo in the Edit menu still undoes the change while the sessions list has focus, unless the list changed since in a way that conflicts with it.", change.help);
	}

	/** Stops offering Undo for `entry` in its notice, closing it, and completes its changes that can't be reverted once made. */
	private end(entry: INoticeEntry): void {
		if (entry.ended) {
			return;
		}
		entry.ended = true;
		if (this.current === entry) {
			this.current = undefined;
		}
		entry.handle?.close();
		for (const element of entry.elements.splice(0)) {
			if (element.change.commit) {
				this.commit(element);
			}
		}
	}

	/** Completes `element`, which then can no longer be undone. */
	private commit(element: SessionsListUndoElement): void {
		element.committed = true;
		this.undoRedoService.setElementsValidFlag(SESSIONS_LIST_UNDO_RESOURCE, false, candidate => candidate === element);
		this.runCommit(element.change);
	}

	private runCommit(change: ISessionsListChange): void {
		if (change.commit) {
			const commit = change.commit().catch(error => this.notificationService.error(error));
			this.pendingCommits.add(commit);
			commit.finally(() => this.pendingCommits.delete(commit));
		}
	}
}
