/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/** Swallows the brief idle gap between a turn ending and a queued turn starting. */
const COMPLETED_DELAY_MS = 1_500;

export interface IMobileNotificationHost {
	readonly permission: NotificationPermission;
	isHidden(): boolean;
	requestPermission(): Promise<NotificationPermission>;
	createNotification(title: string, options: NotificationOptions): EventTarget & { close(): void };
	focus(): void;
	vibrate(pattern: VibratePattern): void;
}

/** Notifies about current session changes while the phone app is hidden. */
export class MobileBackgroundNotifier extends Disposable {
	private readonly _statusListeners = this._register(new DisposableMap<string>());
	private readonly _shown = this._register(new DisposableMap<string>());

	constructor(
		private readonly _host: IMobileNotificationHost,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();

		for (const session of this._sessionsManagementService.getSessions()) {
			this._track(session);
		}
		this._register(this._sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._statusListeners.deleteAndDispose(session.sessionId);
				this._close(session);
			}
			for (const session of event.added) {
				this._track(session);
			}
		}));
	}

	private _track(session: ISession): void {
		const store = new DisposableStore();
		this._statusListeners.set(session.sessionId, store);
		let generation = 0;
		const notify = (status: SessionStatus) => {
			const currentGeneration = generation;
			void this._notify(session, status, () => !store.isDisposed && generation === currentGeneration).catch(onUnexpectedError);
		};
		const completed = store.add(new RunOnceScheduler(() => notify(SessionStatus.Completed), COMPLETED_DELAY_MS));
		store.add(autorunDelta(session.status, ({ lastValue, newValue }) => {
			if (lastValue === undefined || lastValue === newValue) {
				return;
			}
			generation++;
			this._close(session);
			if (newValue === SessionStatus.Completed) {
				completed.schedule();
			} else {
				completed.cancel();
			}
			if (newValue === SessionStatus.NeedsInput || newValue === SessionStatus.Error) {
				notify(newValue);
			}
		}));
	}

	private async _notify(session: ISession, status: SessionStatus, isCurrent: () => boolean): Promise<void> {
		const canNotify = () => !this._store.isDisposed && isCurrent() && session.status.get() === status && this._host.isHidden();
		if (!canNotify()) {
			return;
		}
		if (!(await this._ensurePermission()) || !canNotify()) {
			return;
		}

		const title = session.title.get();
		const body = status === SessionStatus.NeedsInput
			? localize('mobileNotify.needsInput', "Needs your input")
			: status === SessionStatus.Error
				? localize('mobileNotify.failed', "Stopped with an error")
				: localize('mobileNotify.completed', "Finished");

		const notificationStore = new DisposableStore();
		this._shown.set(session.sessionId, notificationStore);
		const notification = this._host.createNotification(title, {
			body,
			tag: session.resource.toString(),
			icon: 'favicon.ico',
		});
		notificationStore.add(toDisposable(() => notification.close()));
		notificationStore.add(addDisposableListener(notification, 'click', () => {
			this._host.focus();
			void this._sessionsService.openSession(session.resource, { source: 'notification' }).catch(onUnexpectedError);
			this._close(session);
		}));

		this._host.vibrate(status === SessionStatus.NeedsInput ? [60, 40, 60] : 40);
	}

	private async _ensurePermission(): Promise<boolean> {
		if (this._host.permission === 'granted') {
			return true;
		}
		if (this._host.permission === 'denied') {
			return false;
		}
		try {
			return (await this._host.requestPermission()) === 'granted';
		} catch {
			return false;
		}
	}

	private _close(session: ISession): void {
		this._shown.deleteAndDispose(session.sessionId);
	}
}

class MobileBackgroundNotifierContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.mobileBackgroundNotifier';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		if (typeof Notification === 'undefined') {
			return;
		}
		this._register(instantiationService.createInstance(MobileBackgroundNotifier, {
			get permission() { return Notification.permission; },
			isHidden: () => mainWindow.document.hidden,
			requestPermission: () => Notification.requestPermission(),
			createNotification: (title, options) => new Notification(title, options),
			focus: () => mainWindow.focus(),
			vibrate: pattern => mainWindow.navigator.vibrate?.(pattern),
		}));
	}
}

registerWorkbenchContribution2(MobileBackgroundNotifierContribution.ID, MobileBackgroundNotifierContribution, WorkbenchPhase.Eventually);
