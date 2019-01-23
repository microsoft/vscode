/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/progressService2';

import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IProgressService2, IProgressOptions, IProgressStep, ProgressLocation, IProgress, emptyProgress, Progress } from 'vs/platform/progress/common/progress';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { StatusbarAlignment, IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { always, timeout } from 'vs/base/common/async';
import { ProgressBadge, IActivityService } from 'vs/workbench/services/activity/common/activity';
import { INotificationService, Severity, INotificationHandle, INotificationActions } from 'vs/platform/notification/common/notification';
import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';

export class ProgressService2 implements IProgressService2 {

	_serviceBrand: any;

	private readonly _stack: [IProgressOptions, Progress<IProgressStep>][] = [];
	private _globalStatusEntry: IDisposable;

	constructor(
		@IActivityService private readonly _activityBar: IActivityService,
		@IViewletService private readonly _viewletService: IViewletService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStatusbarService private readonly _statusbarService: IStatusbarService,
	) { }

	withProgress<P extends Promise<R>, R=any>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => P, onDidCancel?: () => void): P {

		const { location } = options;
		if (typeof location === 'string') {
			const viewlet = this._viewletService.getViewlet(location);
			if (viewlet) {
				return this._withViewletProgress(location, task);
			}
			console.warn(`Bad progress location: ${location}`);
			return undefined;
		}

		switch (location) {
			case ProgressLocation.Notification:
				return this._withNotificationProgress(options, task, onDidCancel);
			case ProgressLocation.Window:
				return this._withWindowProgress(options, task);
			case ProgressLocation.Explorer:
				return this._withViewletProgress('workbench.view.explorer', task);
			case ProgressLocation.Scm:
				return this._withViewletProgress('workbench.view.scm', task);
			case ProgressLocation.Extensions:
				return this._withViewletProgress('workbench.view.extensions', task);
			default:
				console.warn(`Bad progress location: ${location}`);
				return undefined;
		}
	}

	private _withWindowProgress<P extends Promise<R>, R=any>(options: IProgressOptions, callback: (progress: IProgress<{ message?: string }>) => P): P {

		const task: [IProgressOptions, Progress<IProgressStep>] = [options, new Progress<IProgressStep>(() => this._updateWindowProgress())];

		const promise = callback(task[1]);

		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;
			this._stack.unshift(task);
			this._updateWindowProgress();

			// show progress for at least 150ms
			always(Promise.all([
				timeout(150),
				promise
			]), () => {
				const idx = this._stack.indexOf(task);
				this._stack.splice(idx, 1);
				this._updateWindowProgress();
			});

		}, 150);

		// cancel delay if promise finishes below 150ms
		always(promise, () => clearTimeout(delayHandle));
		return promise;
	}

	private _updateWindowProgress(idx: number = 0) {

		dispose(this._globalStatusEntry);

		if (idx < this._stack.length) {

			const [options, progress] = this._stack[idx];

			let progressTitle = options.title;
			let progressMessage = progress.value && progress.value.message;
			let text: string;
			let title: string;

			if (progressTitle && progressMessage) {
				// <title>: <message>
				text = localize('progress.text2', "{0}: {1}", progressTitle, progressMessage);
				title = options.source ? localize('progress.title3', "[{0}] {1}: {2}", options.source, progressTitle, progressMessage) : text;

			} else if (progressTitle) {
				// <title>
				text = progressTitle;
				title = options.source ? localize('progress.title2', "[{0}]: {1}", options.source, progressTitle) : text;

			} else if (progressMessage) {
				// <message>
				text = progressMessage;
				title = options.source ? localize('progress.title2', "[{0}]: {1}", options.source, progressMessage) : text;

			} else {
				// no title, no message -> no progress. try with next on stack
				this._updateWindowProgress(idx + 1);
				return;
			}

			this._globalStatusEntry = this._statusbarService.addEntry({
				text: `$(sync~spin) ${text}`,
				tooltip: title
			}, StatusbarAlignment.LEFT);
		}
	}

	private _withNotificationProgress<P extends Promise<R>, R=any>(options: IProgressOptions, callback: (progress: IProgress<{ message?: string, increment?: number }>) => P, onDidCancel?: () => void): P {
		const toDispose: IDisposable[] = [];

		const createNotification = (message: string | undefined, increment?: number): INotificationHandle | undefined => {
			if (!message) {
				return undefined; // we need a message at least
			}

			const actions: INotificationActions = { primary: [] };
			if (options.cancellable) {
				const cancelAction = new class extends Action {
					constructor() {
						super('progress.cancel', localize('cancel', "Cancel"), undefined, true);
					}

					run(): Promise<any> {
						if (typeof onDidCancel === 'function') {
							onDidCancel();
						}

						return Promise.resolve(undefined);
					}
				};
				toDispose.push(cancelAction);

				actions.primary!.push(cancelAction);
			}

			const handle = this._notificationService.notify({
				severity: Severity.Info,
				message,
				source: options.source,
				actions
			});

			updateProgress(handle, increment);

			Event.once(handle.onDidClose)(() => {
				dispose(toDispose);
			});

			return handle;
		};

		const updateProgress = (notification: INotificationHandle, increment?: number): void => {
			if (typeof increment === 'number' && increment >= 0) {
				notification.progress.total(100); // always percentage based
				notification.progress.worked(increment);
			} else {
				notification.progress.infinite();
			}
		};

		let handle: INotificationHandle | undefined;
		const updateNotification = (message?: string, increment?: number): void => {
			if (!handle) {
				handle = createNotification(message, increment);
			} else {
				if (typeof message === 'string') {
					let newMessage: string;
					if (typeof options.title === 'string') {
						newMessage = `${options.title}: ${message}`; // always prefix with overall title if we have it (https://github.com/Microsoft/vscode/issues/50932)
					} else {
						newMessage = message;
					}

					handle.updateMessage(newMessage);
				}

				if (typeof increment === 'number') {
					updateProgress(handle, increment);
				}
			}
		};

		// Show initially
		updateNotification(options.title);

		// Update based on progress
		const p = callback({
			report: progress => {
				updateNotification(progress.message, progress.increment);
			}
		});

		// Show progress for at least 800ms and then hide once done or canceled
		always(Promise.all([timeout(800), p]), () => {
			if (handle) {
				handle.close();
			}
		});

		return p;
	}

	private _withViewletProgress<P extends Promise<R>, R=any>(viewletId: string, task: (progress: IProgress<{ message?: string }>) => P): P {

		const promise = task(emptyProgress);

		// show in viewlet
		const viewletProgress = this._viewletService.getProgressIndicator(viewletId);
		if (viewletProgress) {
			viewletProgress.showWhile(promise);
		}

		// show activity bar
		let activityProgress: IDisposable;
		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;
			const handle = this._activityBar.showActivity(
				viewletId,
				new ProgressBadge(() => ''),
				'progress-badge',
				100
			);
			const startTimeVisible = Date.now();
			const minTimeVisible = 300;
			activityProgress = {
				dispose() {
					const d = Date.now() - startTimeVisible;
					if (d < minTimeVisible) {
						// should at least show for Nms
						setTimeout(() => handle.dispose(), minTimeVisible - d);
					} else {
						// shown long enough
						handle.dispose();
					}
				}
			};
		}, 300);

		const onDone = () => {
			clearTimeout(delayHandle);
			dispose(activityProgress);
		};

		promise.then(onDone, onDone);
		return promise;
	}
}
