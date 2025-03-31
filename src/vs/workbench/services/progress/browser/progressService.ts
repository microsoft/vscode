/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/progressService.css';
import { localize } from '../../../../nls.js';
import { IDisposable, dispose, DisposableStore, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IProgressService, IProgressOptions, IProgressStep, ProgressLocation, IProgress, Progress, IProgressCompositeOptions, IProgressNotificationOptions, IProgressRunner, IProgressIndicator, IProgressWindowOptions, IProgressDialogOptions } from '../../../../platform/progress/common/progress.js';
import { StatusbarAlignment, IStatusbarService, IStatusbarEntryAccessor, IStatusbarEntry } from '../../statusbar/browser/statusbar.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { ProgressBadge, IActivityService } from '../../activity/common/activity.js';
import { INotificationService, Severity, INotificationHandle, NotificationPriority, isNotificationSource, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../views/common/viewsService.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { IUserActivityService } from '../../userActivity/common/userActivityService.js';
import { createWorkbenchDialogOptions } from '../../../../platform/dialogs/browser/dialog.js';

export class ProgressService extends Disposable implements IProgressService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IViewDescriptorService private readonly viewDescriptorService: IViewDescriptorService,
		@IViewsService private readonly viewsService: IViewsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IUserActivityService private readonly userActivityService: IUserActivityService,
	) {
		super();
	}

	async withProgress<R = unknown>(options: IProgressOptions, originalTask: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: (choice?: number) => void): Promise<R> {
		const { location } = options;

		const task = async (progress: IProgress<IProgressStep>) => {
			const activeLock = this.userActivityService.markActive({ whenHeldFor: 15_000 });
			try {
				return await originalTask(progress);
			} finally {
				activeLock.dispose();
			}
		};

		const handleStringLocation = (location: string) => {
			const viewContainer = this.viewDescriptorService.getViewContainerById(location);
			if (viewContainer) {
				const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
				if (viewContainerLocation !== null) {
					return this.withPaneCompositeProgress(location, viewContainerLocation, task, { ...options, location });
				}
			}

			if (this.viewDescriptorService.getViewDescriptorById(location) !== null) {
				return this.withViewProgress(location, task, { ...options, location });
			}

			throw new Error(`Bad progress location: ${location}`);
		};

		if (typeof location === 'string') {
			return handleStringLocation(location);
		}

		switch (location) {
			case ProgressLocation.Notification: {
				let priority = (options as IProgressNotificationOptions).priority;
				if (priority !== NotificationPriority.URGENT) {
					if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
						priority = NotificationPriority.SILENT;
					} else if (isNotificationSource(options.source) && this.notificationService.getFilter(options.source) === NotificationsFilter.ERROR) {
						priority = NotificationPriority.SILENT;
					}
				}

				return this.withNotificationProgress({ ...options, location, priority }, task, onDidCancel);
			}
			case ProgressLocation.Window: {
				const type = (options as IProgressWindowOptions).type;
				if ((options as IProgressWindowOptions).command) {
					// Window progress with command get's shown in the status bar
					return this.withWindowProgress({ ...options, location, type }, task);
				}
				// Window progress without command can be shown as silent notification
				// which will first appear in the status bar and can then be brought to
				// the front when clicking.
				return this.withNotificationProgress({ delay: 150 /* default for ProgressLocation.Window */, ...options, priority: NotificationPriority.SILENT, location: ProgressLocation.Notification, type }, task, onDidCancel);
			}
			case ProgressLocation.Explorer:
				return this.withPaneCompositeProgress('workbench.view.explorer', ViewContainerLocation.Sidebar, task, { ...options, location });
			case ProgressLocation.Scm:
				return handleStringLocation('workbench.scm');
			case ProgressLocation.Extensions:
				return this.withPaneCompositeProgress('workbench.view.extensions', ViewContainerLocation.Sidebar, task, { ...options, location });
			case ProgressLocation.Dialog:
				return this.withDialogProgress(options, task, onDidCancel);
			default:
				throw new Error(`Bad progress location: ${location}`);
		}
	}

	private readonly windowProgressStack: [IProgressWindowOptions, Progress<IProgressStep>][] = [];
	private windowProgressStatusEntry: IStatusbarEntryAccessor | undefined = undefined;

	private withWindowProgress<R = unknown>(options: IProgressWindowOptions, callback: (progress: IProgress<{ message?: string }>) => Promise<R>): Promise<R> {
		const task: [IProgressWindowOptions, Progress<IProgressStep>] = [options, new Progress<IProgressStep>(() => this.updateWindowProgress())];

		const promise = callback(task[1]);

		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;
			this.windowProgressStack.unshift(task);
			this.updateWindowProgress();

			// show progress for at least 150ms
			Promise.all([
				timeout(150),
				promise
			]).finally(() => {
				const idx = this.windowProgressStack.indexOf(task);
				this.windowProgressStack.splice(idx, 1);
				this.updateWindowProgress();
			});
		}, 150);

		// cancel delay if promise finishes below 150ms
		return promise.finally(() => clearTimeout(delayHandle));
	}

	private updateWindowProgress(idx: number = 0) {

		// We still have progress to show
		if (idx < this.windowProgressStack.length) {
			const [options, progress] = this.windowProgressStack[idx];

			const progressTitle = options.title;
			const progressMessage = progress.value && progress.value.message;
			const progressCommand = (<IProgressWindowOptions>options).command;
			let text: string;
			let title: string;
			const source = options.source && typeof options.source !== 'string' ? options.source.label : options.source;

			if (progressTitle && progressMessage) {
				// <title>: <message>
				text = localize('progress.text2', "{0}: {1}", progressTitle, progressMessage);
				title = source ? localize('progress.title3', "[{0}] {1}: {2}", source, progressTitle, progressMessage) : text;

			} else if (progressTitle) {
				// <title>
				text = progressTitle;
				title = source ? localize('progress.title2', "[{0}]: {1}", source, progressTitle) : text;

			} else if (progressMessage) {
				// <message>
				text = progressMessage;
				title = source ? localize('progress.title2', "[{0}]: {1}", source, progressMessage) : text;

			} else {
				// no title, no message -> no progress. try with next on stack
				this.updateWindowProgress(idx + 1);
				return;
			}

			const statusEntryProperties: IStatusbarEntry = {
				name: localize('status.progress', "Progress Message"),
				text,
				showProgress: options.type || true,
				ariaLabel: text,
				tooltip: stripIcons(title).trim(),
				command: progressCommand
			};

			if (this.windowProgressStatusEntry) {
				this.windowProgressStatusEntry.update(statusEntryProperties);
			} else {
				this.windowProgressStatusEntry = this.statusbarService.addEntry(statusEntryProperties, 'status.progress', StatusbarAlignment.LEFT, -Number.MAX_VALUE /* almost last entry */);
			}
		}

		// Progress is done so we remove the status entry
		else {
			this.windowProgressStatusEntry?.dispose();
			this.windowProgressStatusEntry = undefined;
		}
	}

	private withNotificationProgress<P extends Promise<R>, R = unknown>(options: IProgressNotificationOptions, callback: (progress: IProgress<IProgressStep>) => P, onDidCancel?: (choice?: number) => void): P {

		const progressStateModel = new class extends Disposable {

			private readonly _onDidReport = this._register(new Emitter<IProgressStep>());
			readonly onDidReport = this._onDidReport.event;

			private readonly _onWillDispose = this._register(new Emitter<void>());
			readonly onWillDispose = this._onWillDispose.event;

			private _step: IProgressStep | undefined = undefined;
			get step() { return this._step; }

			private _done = false;
			get done() { return this._done; }

			readonly promise: P;

			constructor() {
				super();

				this.promise = callback(this);

				this.promise.finally(() => {
					this.dispose();
				});
			}

			report(step: IProgressStep): void {
				this._step = step;

				this._onDidReport.fire(step);
			}

			cancel(choice?: number): void {
				onDidCancel?.(choice);

				this.dispose();
			}

			override dispose(): void {
				this._done = true;
				this._onWillDispose.fire();

				super.dispose();
			}
		};

		const createWindowProgress = () => {

			// Create a promise that we can resolve as needed
			// when the outside calls dispose on us
			const promise = new DeferredPromise<void>();

			this.withWindowProgress({
				location: ProgressLocation.Window,
				title: options.title ? parseLinkedText(options.title).toString() : undefined, // convert markdown links => string
				command: 'notifications.showList',
				type: options.type
			}, progress => {

				function reportProgress(step: IProgressStep) {
					if (step.message) {
						progress.report({
							message: parseLinkedText(step.message).toString()  // convert markdown links => string
						});
					}
				}

				// Apply any progress that was made already
				if (progressStateModel.step) {
					reportProgress(progressStateModel.step);
				}

				// Continue to report progress as it happens
				const onDidReportListener = progressStateModel.onDidReport(step => reportProgress(step));
				promise.p.finally(() => onDidReportListener.dispose());

				// When the progress model gets disposed, we are done as well
				Event.once(progressStateModel.onWillDispose)(() => promise.complete());

				return promise.p;
			});

			// Dispose means completing our promise
			return toDisposable(() => promise.complete());
		};

		const createNotification = (message: string, priority?: NotificationPriority, increment?: number): INotificationHandle => {
			const notificationDisposables = new DisposableStore();

			const primaryActions = options.primaryActions ? Array.from(options.primaryActions) : [];
			const secondaryActions = options.secondaryActions ? Array.from(options.secondaryActions) : [];

			if (options.buttons) {
				options.buttons.forEach((button, index) => {
					const buttonAction = new class extends Action {
						constructor() {
							super(`progress.button.${button}`, button, undefined, true);
						}

						override async run(): Promise<void> {
							progressStateModel.cancel(index);
						}
					};
					notificationDisposables.add(buttonAction);

					primaryActions.push(buttonAction);
				});
			}

			if (options.cancellable) {
				const cancelAction = new class extends Action {
					constructor() {
						super('progress.cancel', typeof options.cancellable === 'string' ? options.cancellable : localize('cancel', "Cancel"), undefined, true);
					}

					override async run(): Promise<void> {
						progressStateModel.cancel();
					}
				};
				notificationDisposables.add(cancelAction);

				primaryActions.push(cancelAction);
			}

			const notification = this.notificationService.notify({
				severity: Severity.Info,
				message: stripIcons(message), // status entries support codicons, but notifications do not (https://github.com/microsoft/vscode/issues/145722)
				source: options.source,
				actions: { primary: primaryActions, secondary: secondaryActions },
				progress: typeof increment === 'number' && increment >= 0 ? { total: 100, worked: increment } : { infinite: true },
				priority
			});

			// Switch to window based progress once the notification
			// changes visibility to hidden and is still ongoing.
			// Remove that window based progress once the notification
			// shows again.
			let windowProgressDisposable: IDisposable | undefined = undefined;
			const onVisibilityChange = (visible: boolean) => {
				// Clear any previous running window progress
				dispose(windowProgressDisposable);

				// Create new window progress if notification got hidden
				if (!visible && !progressStateModel.done) {
					windowProgressDisposable = createWindowProgress();
				}
			};
			notificationDisposables.add(notification.onDidChangeVisibility(onVisibilityChange));
			if (priority === NotificationPriority.SILENT) {
				onVisibilityChange(false);
			}

			// Clear upon dispose
			Event.once(notification.onDidClose)(() => {
				notificationDisposables.dispose();
				dispose(windowProgressDisposable);
			});

			return notification;
		};

		const updateProgress = (notification: INotificationHandle, increment?: number): void => {
			if (typeof increment === 'number' && increment >= 0) {
				notification.progress.total(100); // always percentage based
				notification.progress.worked(increment);
			} else {
				notification.progress.infinite();
			}
		};

		let notificationHandle: INotificationHandle | undefined;
		let notificationTimeout: any | undefined;
		let titleAndMessage: string | undefined; // hoisted to make sure a delayed notification shows the most recent message

		const updateNotification = (step?: IProgressStep): void => {

			// full message (inital or update)
			if (step?.message && options.title) {
				titleAndMessage = `${options.title}: ${step.message}`; // always prefix with overall title if we have it (https://github.com/microsoft/vscode/issues/50932)
			} else {
				titleAndMessage = options.title || step?.message;
			}

			if (!notificationHandle && titleAndMessage) {

				// create notification now or after a delay
				if (typeof options.delay === 'number' && options.delay > 0) {
					if (typeof notificationTimeout !== 'number') {
						notificationTimeout = setTimeout(() => notificationHandle = createNotification(titleAndMessage!, options.priority, step?.increment), options.delay);
					}
				} else {
					notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment);
				}
			}

			if (notificationHandle) {
				if (titleAndMessage) {
					notificationHandle.updateMessage(titleAndMessage);
				}

				if (typeof step?.increment === 'number') {
					updateProgress(notificationHandle, step.increment);
				}
			}
		};

		// Show initially
		updateNotification(progressStateModel.step);
		const listener = progressStateModel.onDidReport(step => updateNotification(step));
		Event.once(progressStateModel.onWillDispose)(() => listener.dispose());

		// Clean up eventually
		(async () => {
			try {

				// with a delay we only wait for the finish of the promise
				if (typeof options.delay === 'number' && options.delay > 0) {
					await progressStateModel.promise;
				}

				// without a delay we show the notification for at least 800ms
				// to reduce the chance of the notification flashing up and hiding
				else {
					await Promise.all([timeout(800), progressStateModel.promise]);
				}
			} finally {
				clearTimeout(notificationTimeout);
				notificationHandle?.close();
			}
		})();

		return progressStateModel.promise;
	}

	private withPaneCompositeProgress<P extends Promise<R>, R = unknown>(paneCompositeId: string, viewContainerLocation: ViewContainerLocation, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {

		// show in viewlet
		const progressIndicator = this.paneCompositeService.getProgressIndicator(paneCompositeId, viewContainerLocation);
		const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => { } });

		// show on activity bar
		if (viewContainerLocation === ViewContainerLocation.Sidebar) {
			this.showOnActivityBar<P, R>(paneCompositeId, options, promise);
		}

		return promise;
	}

	private withViewProgress<P extends Promise<R>, R = unknown>(viewId: string, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {

		// show in viewlet
		const progressIndicator = this.viewsService.getViewProgressIndicator(viewId);
		const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => { } });

		const viewletId = this.viewDescriptorService.getViewContainerByViewId(viewId)?.id;
		if (viewletId === undefined) {
			return promise;
		}

		// show on activity bar
		this.showOnActivityBar(viewletId, options, promise);

		return promise;
	}

	private showOnActivityBar<P extends Promise<R>, R = unknown>(viewletId: string, options: IProgressCompositeOptions, promise: P): void {
		let activityProgress: IDisposable;
		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;
			const handle = this.activityService.showViewContainerActivity(viewletId, { badge: new ProgressBadge(() => '') });
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
		}, options.delay || 300);
		promise.finally(() => {
			clearTimeout(delayHandle);
			dispose(activityProgress);
		});
	}

	private withCompositeProgress<P extends Promise<R>, R = unknown>(progressIndicator: IProgressIndicator, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {
		let discreteProgressRunner: IProgressRunner | undefined = undefined;

		function updateProgress(stepOrTotal: IProgressStep | number | undefined): IProgressRunner | undefined {

			// Figure out whether discrete progress applies
			// by figuring out the "total" progress to show
			// and the increment if any.
			let total: number | undefined = undefined;
			let increment: number | undefined = undefined;
			if (typeof stepOrTotal !== 'undefined') {
				if (typeof stepOrTotal === 'number') {
					total = stepOrTotal;
				} else if (typeof stepOrTotal.increment === 'number') {
					total = stepOrTotal.total ?? 100; // always percentage based
					increment = stepOrTotal.increment;
				}
			}

			// Discrete
			if (typeof total === 'number') {
				if (!discreteProgressRunner) {
					discreteProgressRunner = progressIndicator.show(total, options.delay);
					promise.catch(() => undefined /* ignore */).finally(() => discreteProgressRunner?.done());
				}

				if (typeof increment === 'number') {
					discreteProgressRunner.worked(increment);
				}
			}

			// Infinite
			else {
				discreteProgressRunner?.done();
				progressIndicator.showWhile(promise, options.delay);
			}

			return discreteProgressRunner;
		}

		const promise = task({
			report: progress => {
				updateProgress(progress);
			}
		});

		updateProgress(options.total);

		return promise;
	}

	private withDialogProgress<P extends Promise<R>, R = unknown>(options: IProgressDialogOptions, task: (progress: IProgress<IProgressStep>) => P, onDidCancel?: (choice?: number) => void): P {
		const disposables = new DisposableStore();

		let dialog: Dialog;
		let taskCompleted = false;

		const createDialog = (message: string) => {
			const buttons = options.buttons || [];
			if (!options.sticky) {
				buttons.push(options.cancellable
					? (typeof options.cancellable === 'boolean' ? localize('cancel', "Cancel") : options.cancellable)
					: localize('dismiss', "Dismiss")
				);
			}

			dialog = new Dialog(
				this.layoutService.activeContainer,
				message,
				buttons,
				createWorkbenchDialogOptions({
					type: 'pending',
					detail: options.detail,
					cancelId: buttons.length - 1,
					disableCloseAction: options.sticky,
					disableDefaultAction: options.sticky
				}, this.keybindingService, this.layoutService)
			);

			disposables.add(dialog);

			dialog.show().then(dialogResult => {
				if (!taskCompleted) {
					onDidCancel?.(dialogResult.button);
				}
				dispose(dialog);
			});

			return dialog;
		};

		// In order to support the `delay` option, we use a scheduler
		// that will guard each access to the dialog behind a delay
		// that is either the original delay for one invocation and
		// otherwise runs without delay.
		let delay = options.delay ?? 0;
		let latestMessage: string | undefined = undefined;
		const scheduler = disposables.add(new RunOnceScheduler(() => {
			delay = 0; // since we have run once, we reset the delay

			if (latestMessage && !dialog) {
				dialog = createDialog(latestMessage);
			} else if (latestMessage) {
				dialog.updateMessage(latestMessage);
			}
		}, 0));

		const updateDialog = function (message?: string): void {
			latestMessage = message;

			// Make sure to only run one dialog update and not multiple
			if (!scheduler.isScheduled()) {
				scheduler.schedule(delay);
			}
		};

		const promise = task({
			report: progress => {
				updateDialog(progress.message);
			}
		});

		promise.finally(() => {
			taskCompleted = true;
			dispose(disposables);
		});

		if (options.title) {
			updateDialog(options.title);
		}

		return promise;
	}
}

registerSingleton(IProgressService, ProgressService, InstantiationType.Delayed);
