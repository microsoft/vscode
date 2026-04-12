/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import './media/progressService.css';
import { localize } from '../../../../nls.js';
import { dispose, DisposableStore, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IProgressService, Progress } from '../../../../platform/progress/common/progress.js';
import { IStatusbarService } from '../../statusbar/browser/statusbar.js';
import { DeferredPromise, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { ProgressBadge, IActivityService } from '../../activity/common/activity.js';
import { INotificationService, Severity, NotificationPriority, isNotificationSource, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { Dialog } from '../../../../base/browser/ui/dialog/dialog.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { parseLinkedText } from '../../../../base/common/linkedText.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../views/common/viewsService.js';
import { IPaneCompositePartService } from '../../panecomposite/browser/panecomposite.js';
import { stripIcons } from '../../../../base/common/iconLabels.js';
import { IUserActivityService } from '../../userActivity/common/userActivityService.js';
import { createWorkbenchDialogOptions } from '../../../browser/parts/dialogs/dialog.js';
import { IHostService } from '../../host/browser/host.js';
let ProgressService = class ProgressService extends Disposable {
    constructor(activityService, paneCompositeService, viewDescriptorService, viewsService, notificationService, statusbarService, layoutService, keybindingService, userActivityService, hostService) {
        super();
        this.activityService = activityService;
        this.paneCompositeService = paneCompositeService;
        this.viewDescriptorService = viewDescriptorService;
        this.viewsService = viewsService;
        this.notificationService = notificationService;
        this.statusbarService = statusbarService;
        this.layoutService = layoutService;
        this.keybindingService = keybindingService;
        this.userActivityService = userActivityService;
        this.hostService = hostService;
        this.windowProgressStack = [];
        this.windowProgressStatusEntry = undefined;
    }
    async withProgress(options, originalTask, onDidCancel) {
        const { location } = options;
        const task = async (progress) => {
            const activeLock = this.userActivityService.markActive({ extendOnly: true, whenHeldFor: 15_000 });
            try {
                return await originalTask(progress);
            }
            finally {
                activeLock.dispose();
            }
        };
        const handleStringLocation = (location) => {
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
            case 15 /* ProgressLocation.Notification */: {
                let priority = options.priority;
                if (priority !== NotificationPriority.URGENT) {
                    if (this.notificationService.getFilter() === NotificationsFilter.ERROR) {
                        priority = NotificationPriority.SILENT;
                    }
                    else if (isNotificationSource(options.source) && this.notificationService.getFilter(options.source) === NotificationsFilter.ERROR) {
                        priority = NotificationPriority.SILENT;
                    }
                }
                return this.withNotificationProgress({ ...options, location, priority }, task, onDidCancel);
            }
            case 10 /* ProgressLocation.Window */: {
                const type = options.type;
                if (options.command) {
                    // Window progress with command get's shown in the status bar
                    return this.withWindowProgress({ ...options, location, type }, task);
                }
                // Window progress without command can be shown as silent notification
                // which will first appear in the status bar and can then be brought to
                // the front when clicking.
                return this.withNotificationProgress({ delay: 150 /* default for ProgressLocation.Window */, ...options, priority: NotificationPriority.SILENT, location: 15 /* ProgressLocation.Notification */, type }, task, onDidCancel);
            }
            case 1 /* ProgressLocation.Explorer */:
                return this.withPaneCompositeProgress('workbench.view.explorer', 0 /* ViewContainerLocation.Sidebar */, task, { ...options, location });
            case 3 /* ProgressLocation.Scm */:
                return handleStringLocation('workbench.scm');
            case 5 /* ProgressLocation.Extensions */:
                return this.withPaneCompositeProgress('workbench.view.extensions', 0 /* ViewContainerLocation.Sidebar */, task, { ...options, location });
            case 20 /* ProgressLocation.Dialog */:
                return this.withDialogProgress(options, task, onDidCancel);
            default:
                throw new Error(`Bad progress location: ${location}`);
        }
    }
    withWindowProgress(options, callback) {
        const task = [options, new Progress(() => this.updateWindowProgress())];
        const promise = callback(task[1]);
        let delayHandle = setTimeout(() => {
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
    updateWindowProgress(idx = 0) {
        // We still have progress to show
        if (idx < this.windowProgressStack.length) {
            const [options, progress] = this.windowProgressStack[idx];
            const progressTitle = options.title;
            const progressMessage = progress.value?.message;
            const progressCommand = options.command;
            let text;
            let title;
            const source = options.source && typeof options.source !== 'string' ? options.source.label : options.source;
            if (progressTitle && progressMessage) {
                // <title>: <message>
                text = localize('progress.text2', "{0}: {1}", progressTitle, progressMessage);
                title = source ? localize('progress.title3', "[{0}] {1}: {2}", source, progressTitle, progressMessage) : text;
            }
            else if (progressTitle) {
                // <title>
                text = progressTitle;
                title = source ? localize('progress.title2', "[{0}]: {1}", source, progressTitle) : text;
            }
            else if (progressMessage) {
                // <message>
                text = progressMessage;
                title = source ? localize('progress.title2', "[{0}]: {1}", source, progressMessage) : text;
            }
            else {
                // no title, no message -> no progress. try with next on stack
                this.updateWindowProgress(idx + 1);
                return;
            }
            const statusEntryProperties = {
                name: localize('status.progress', "Progress Message"),
                text,
                showProgress: options.type || true,
                ariaLabel: text,
                tooltip: stripIcons(title).trim(),
                command: progressCommand
            };
            if (this.windowProgressStatusEntry) {
                this.windowProgressStatusEntry.update(statusEntryProperties);
            }
            else {
                this.windowProgressStatusEntry = this.statusbarService.addEntry(statusEntryProperties, 'status.progress', 0 /* StatusbarAlignment.LEFT */, -Number.MAX_VALUE /* almost last entry */);
            }
        }
        // Progress is done so we remove the status entry
        else {
            this.windowProgressStatusEntry?.dispose();
            this.windowProgressStatusEntry = undefined;
        }
    }
    withNotificationProgress(options, callback, onDidCancel) {
        const progressStateModel = new class extends Disposable {
            get step() { return this._step; }
            get done() { return this._done; }
            constructor() {
                super();
                this._onDidReport = this._register(new Emitter());
                this.onDidReport = this._onDidReport.event;
                this._onWillDispose = this._register(new Emitter());
                this.onWillDispose = this._onWillDispose.event;
                this._step = undefined;
                this._done = false;
                this.promise = callback(this);
                this.promise.finally(() => {
                    this.dispose();
                });
            }
            report(step) {
                this._step = step;
                this._onDidReport.fire(step);
            }
            cancel(choice) {
                onDidCancel?.(choice);
                this.dispose();
            }
            dispose() {
                this._done = true;
                this._onWillDispose.fire();
                super.dispose();
            }
        };
        const createWindowProgress = () => {
            // Create a promise that we can resolve as needed
            // when the outside calls dispose on us
            const promise = new DeferredPromise();
            this.withWindowProgress({
                location: 10 /* ProgressLocation.Window */,
                title: options.title ? parseLinkedText(options.title).toString() : undefined, // convert markdown links => string
                command: 'notifications.showList',
                type: options.type
            }, progress => {
                function reportProgress(step) {
                    if (step.message) {
                        progress.report({
                            message: parseLinkedText(step.message).toString() // convert markdown links => string
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
        const createNotification = (message, priority, increment) => {
            const notificationDisposables = new DisposableStore();
            const primaryActions = options.primaryActions ? Array.from(options.primaryActions) : [];
            const secondaryActions = options.secondaryActions ? Array.from(options.secondaryActions) : [];
            if (options.buttons) {
                options.buttons.forEach((button, index) => {
                    const buttonAction = new class extends Action {
                        constructor() {
                            super(`progress.button.${button}`, button, undefined, true);
                        }
                        async run() {
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
                    async run() {
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
            let windowProgressDisposable = undefined;
            const onVisibilityChange = (visible) => {
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
        const updateProgress = (notification, increment) => {
            if (typeof increment === 'number' && increment >= 0) {
                notification.progress.total(100); // always percentage based
                notification.progress.worked(increment);
            }
            else {
                notification.progress.infinite();
            }
        };
        let notificationHandle;
        let notificationTimeout;
        let titleAndMessage; // hoisted to make sure a delayed notification shows the most recent message
        const updateNotification = (step) => {
            // full message (inital or update)
            if (step?.message && options.title) {
                titleAndMessage = `${options.title}: ${step.message}`; // always prefix with overall title if we have it (https://github.com/microsoft/vscode/issues/50932)
            }
            else {
                titleAndMessage = options.title || step?.message;
            }
            if (!notificationHandle && titleAndMessage) {
                // create notification now or after a delay
                if (typeof options.delay === 'number' && options.delay > 0) {
                    if (notificationTimeout === undefined) {
                        notificationTimeout = setTimeout(() => notificationHandle = createNotification(titleAndMessage, options.priority, step?.increment), options.delay);
                    }
                }
                else {
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
            }
            finally {
                clearTimeout(notificationTimeout);
                notificationHandle?.close();
            }
        })();
        return progressStateModel.promise;
    }
    withPaneCompositeProgress(paneCompositeId, viewContainerLocation, task, options) {
        // show in viewlet
        const progressIndicator = this.paneCompositeService.getProgressIndicator(paneCompositeId, viewContainerLocation);
        const promise = progressIndicator ? this.withCompositeProgress(progressIndicator, task, options) : task({ report: () => { } });
        // show on activity bar
        if (viewContainerLocation === 0 /* ViewContainerLocation.Sidebar */) {
            this.showOnActivityBar(paneCompositeId, options, promise);
        }
        return promise;
    }
    withViewProgress(viewId, task, options) {
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
    showOnActivityBar(viewletId, options, promise) {
        let activityProgress;
        let delayHandle = setTimeout(() => {
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
                    }
                    else {
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
    withCompositeProgress(progressIndicator, task, options) {
        let discreteProgressRunner = undefined;
        function updateProgress(stepOrTotal) {
            // Figure out whether discrete progress applies
            // by figuring out the "total" progress to show
            // and the increment if any.
            let total = undefined;
            let increment = undefined;
            if (typeof stepOrTotal !== 'undefined') {
                if (typeof stepOrTotal === 'number') {
                    total = stepOrTotal;
                }
                else if (typeof stepOrTotal.increment === 'number') {
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
    withDialogProgress(options, task, onDidCancel) {
        const disposables = new DisposableStore();
        let dialog;
        let taskCompleted = false;
        const createDialog = (message) => {
            const buttons = options.buttons || [];
            if (!options.sticky) {
                buttons.push(options.cancellable
                    ? (typeof options.cancellable === 'boolean' ? localize('cancel', "Cancel") : options.cancellable)
                    : localize('dismiss', "Dismiss"));
            }
            dialog = new Dialog(this.layoutService.activeContainer, message, buttons, createWorkbenchDialogOptions({
                type: 'pending',
                detail: options.detail,
                cancelId: buttons.length - 1,
                disableCloseAction: options.sticky,
                disableDefaultAction: options.sticky
            }, this.keybindingService, this.layoutService, this.hostService));
            disposables.add(dialog);
            dialog.show().then(dialogResult => {
                // The dialog may close as a result of disposing it after the
                // task has completed. In that case, we do not want to trigger
                // the `onDidCancel` callback.
                // However, if the task is still running, this means that the
                // user has clicked the cancel button and we want to trigger
                // the `onDidCancel` callback.
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
        let latestMessage = undefined;
        const scheduler = disposables.add(new RunOnceScheduler(() => {
            delay = 0; // since we have run once, we reset the delay
            if (latestMessage && !dialog) {
                dialog = createDialog(latestMessage);
            }
            else if (latestMessage) {
                dialog.updateMessage(latestMessage);
            }
        }, 0));
        const updateDialog = function (message) {
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
};
ProgressService = __decorate([
    __param(0, IActivityService),
    __param(1, IPaneCompositePartService),
    __param(2, IViewDescriptorService),
    __param(3, IViewsService),
    __param(4, INotificationService),
    __param(5, IStatusbarService),
    __param(6, ILayoutService),
    __param(7, IKeybindingService),
    __param(8, IUserActivityService),
    __param(9, IHostService)
], ProgressService);
export { ProgressService };
registerSingleton(IProgressService, ProgressService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvZ3Jlc3NTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3Byb2dyZXNzL2Jyb3dzZXIvcHJvZ3Jlc3NTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sNkJBQTZCLENBQUM7QUFDckMsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBZSxPQUFPLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN2SCxPQUFPLEVBQUUsZ0JBQWdCLEVBQWdFLFFBQVEsRUFBZ0osTUFBTSxrREFBa0QsQ0FBQztBQUMxUyxPQUFPLEVBQXNCLGlCQUFpQixFQUE0QyxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZJLE9BQU8sRUFBRSxlQUFlLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDOUYsT0FBTyxFQUFFLGFBQWEsRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQXVCLG9CQUFvQixFQUFFLG9CQUFvQixFQUFFLG1CQUFtQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaE0sT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFxQixpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFD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