/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/progressService';

import { localize } from 'vs/nls';
import { IDisposable, dispose, DisposableStore, MutableDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IProgressService, IProgressOptions, IProgressStep, ProgressLocation, IProgress, Progress, IProgressCompositeOptions, IProgressNotificationOptions, IProgressRunner, IProgressIndicator } from 'vs/platform/progress/common/progress';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { StatusbarAlignment, IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { timeout } from 'vs/base/common/async';
import { ProgressBadge, IActivityService } from 'vs/workbench/services/activity/common/activity';
import { INotificationService, Severity, INotificationHandle, INotificationActions } from 'vs/platform/notification/common/notification';
import { Action } from 'vs/base/common/actions';
import { Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILayoutService } from 'vs/platform/layout/browser/layoutService';
import { Dialog } from 'vs/base/browser/ui/dialog/dialog';
import { attachDialogStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { EventHelper } from 'vs/base/browser/dom';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';

export class ProgressService extends Disposable implements IProgressService {

	_serviceBrand!: ServiceIdentifier<IProgressService>;

	private readonly stack: [IProgressOptions, Progress<IProgressStep>][] = [];
	private readonly globalStatusEntry = this._register(new MutableDisposable());

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService,
		@INotificationService private readonly notificationService: INotificationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ILayoutService private readonly layoutService: ILayoutService,
		@IThemeService private readonly themeService: IThemeService,
		@IKeybindingService private readonly keybindingService: IKeybindingService
	) {
		super();
	}

	withProgress<R = unknown>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
		const { location } = options;
		if (typeof location === 'string') {
			if (this.viewletService.getProgressIndicator(location)) {
				return this.withViewletProgress(location, task, { ...options, location });
			}

			if (this.panelService.getProgressIndicator(location)) {
				return this.withPanelProgress(location, task, { ...options, location });
			}

			return Promise.reject(new Error(`Bad progress location: ${location}`));
		}

		switch (location) {
			case ProgressLocation.Notification:
				return this.withNotificationProgress({ ...options, location }, task, onDidCancel);
			case ProgressLocation.Window:
				return this.withWindowProgress(options, task);
			case ProgressLocation.Explorer:
				return this.withViewletProgress('workbench.view.explorer', task, { ...options, location });
			case ProgressLocation.Scm:
				return this.withViewletProgress('workbench.view.scm', task, { ...options, location });
			case ProgressLocation.Extensions:
				return this.withViewletProgress('workbench.view.extensions', task, { ...options, location });
			case ProgressLocation.Dialog:
				return this.withDialogProgress(options, task, onDidCancel);
			default:
				return Promise.reject(new Error(`Bad progress location: ${location}`));
		}
	}

	private withWindowProgress<R = unknown>(options: IProgressOptions, callback: (progress: IProgress<{ message?: string }>) => Promise<R>): Promise<R> {
		const task: [IProgressOptions, Progress<IProgressStep>] = [options, new Progress<IProgressStep>(() => this.updateWindowProgress())];

		const promise = callback(task[1]);

		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;
			this.stack.unshift(task);
			this.updateWindowProgress();

			// show progress for at least 150ms
			Promise.all([
				timeout(150),
				promise
			]).finally(() => {
				const idx = this.stack.indexOf(task);
				this.stack.splice(idx, 1);
				this.updateWindowProgress();
			});
		}, 150);

		// cancel delay if promise finishes below 150ms
		return promise.finally(() => clearTimeout(delayHandle));
	}

	private updateWindowProgress(idx: number = 0) {
		this.globalStatusEntry.clear();

		if (idx < this.stack.length) {
			const [options, progress] = this.stack[idx];

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
				this.updateWindowProgress(idx + 1);
				return;
			}

			this.globalStatusEntry.value = this.statusbarService.addEntry({
				text: `$(sync~spin) ${text}`,
				tooltip: title
			}, 'status.progress', localize('status.progress', "Progress Message"), StatusbarAlignment.LEFT);
		}
	}

	private withNotificationProgress<P extends Promise<R>, R = unknown>(options: IProgressNotificationOptions, callback: (progress: IProgress<{ message?: string, increment?: number }>) => P, onDidCancel?: () => void): P {
		const toDispose = new DisposableStore();

		const createNotification = (message: string | undefined, increment?: number): INotificationHandle | undefined => {
			if (!message) {
				return undefined; // we need a message at least
			}

			const primaryActions = options.primaryActions ? Array.from(options.primaryActions) : [];
			const secondaryActions = options.secondaryActions ? Array.from(options.secondaryActions) : [];
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
				toDispose.add(cancelAction);

				primaryActions.push(cancelAction);
			}

			const actions: INotificationActions = { primary: primaryActions, secondary: secondaryActions };
			const handle = this.notificationService.notify({
				severity: Severity.Info,
				message,
				source: options.source,
				actions
			});

			updateProgress(handle, increment);

			Event.once(handle.onDidClose)(() => {
				toDispose.dispose();
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
		const promise = callback({
			report: progress => {
				updateNotification(progress.message, progress.increment);
			}
		});

		// Show progress for at least 800ms and then hide once done or canceled
		Promise.all([timeout(800), promise]).finally(() => {
			if (handle) {
				handle.close();
			}
		});

		return promise;
	}

	private withViewletProgress<P extends Promise<R>, R = unknown>(viewletId: string, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {

		// show in viewlet
		const promise = this.withCompositeProgress(this.viewletService.getProgressIndicator(viewletId), task, options);

		// show activity bar
		let activityProgress: IDisposable;
		let delayHandle: any = setTimeout(() => {
			delayHandle = undefined;

			const handle = this.activityService.showActivity(
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
		}, options.delay || 300);

		promise.finally(() => {
			clearTimeout(delayHandle);
			dispose(activityProgress);
		});

		return promise;
	}

	private withPanelProgress<P extends Promise<R>, R = unknown>(panelid: string, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {

		// show in panel
		return this.withCompositeProgress(this.panelService.getProgressIndicator(panelid), task, options);
	}

	private withCompositeProgress<P extends Promise<R>, R = unknown>(progressIndicator: IProgressIndicator | null, task: (progress: IProgress<IProgressStep>) => P, options: IProgressCompositeOptions): P {
		let progressRunner: IProgressRunner | undefined = undefined;

		const promise = task({
			report: progress => {
				if (!progressRunner) {
					return;
				}

				if (typeof progress.increment === 'number') {
					progressRunner.worked(progress.increment);
				}

				if (typeof progress.total === 'number') {
					progressRunner.total(progress.total);
				}
			}
		});

		if (progressIndicator) {
			if (typeof options.total === 'number') {
				progressRunner = progressIndicator.show(options.total, options.delay);
				promise.catch(() => undefined /* ignore */).finally(() => progressRunner ? progressRunner.done() : undefined);
			} else {
				progressIndicator.showWhile(promise, options.delay);
			}
		}

		return promise;
	}

	private withDialogProgress<P extends Promise<R>, R = unknown>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => P, onDidCancel?: () => void): P {
		const disposables = new DisposableStore();
		const allowableCommands = [
			'workbench.action.quit',
			'workbench.action.reloadWindow'
		];

		let dialog: Dialog;

		const createDialog = (message: string) => {
			dialog = new Dialog(
				this.layoutService.container,
				message,
				[options.cancellable ? localize('cancel', "Cancel") : localize('dismiss', "Dismiss")],
				{
					type: 'pending',
					keyEventProcessor: (event: StandardKeyboardEvent) => {
						const resolved = this.keybindingService.softDispatch(event, this.layoutService.container);
						if (resolved && resolved.commandId) {
							if (allowableCommands.indexOf(resolved.commandId) === -1) {
								EventHelper.stop(event, true);
							}
						}
					}
				}
			);

			disposables.add(dialog);
			disposables.add(attachDialogStyler(dialog, this.themeService));

			dialog.show().then(() => {
				if (typeof onDidCancel === 'function') {
					onDidCancel();
				}

				dispose(dialog);
			});

			return dialog;
		};

		const updateDialog = (message?: string) => {
			if (message && !dialog) {
				dialog = createDialog(message);
			} else if (message) {
				dialog.updateMessage(message);
			}
		};

		const promise = task({
			report: progress => {
				updateDialog(progress.message);
			}
		});

		promise.finally(() => {
			dispose(disposables);
		});

		return promise;
	}
}

registerSingleton(IProgressService, ProgressService, true);
