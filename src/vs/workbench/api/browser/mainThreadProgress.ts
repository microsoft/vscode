/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProgress, IProgressService, IProgressStep, ProgressLocation, IProgressOptions, IProgressNotificationOptions } from '../../../platform/progress/common/progress.js';
import { MainThreadProgressShape, MainContext, ExtHostProgressShape, ExtHostContext, IProgressOptionsDto, IProgressStepDto } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { CommandsRegistry, ICommandService } from '../../../platform/commands/common/commands.js';
import { localize } from '../../../nls.js';
import { onUnexpectedExternalError } from '../../../base/common/errors.js';
import { toAction } from '../../../base/common/actions.js';
import { NotificationPriority } from '../../../platform/notification/common/notification.js';
import { legacyExtensionLinkParsing } from '../../../platform/notification/common/notificationLegacy.js';
import { extensionNotificationTelemetry, NotificationActionTelemetryId, withNotificationActionTelemetry } from '../../../platform/notification/common/notificationTelemetry.js';

@extHostNamedCustomer(MainContext.MainThreadProgress)
export class MainThreadProgress implements MainThreadProgressShape {

	private static readonly URGENT_PROGRESS_SOURCES = [
		'vscode.github-authentication',
		'vscode.microsoft-authentication'
	];

	private readonly _progressService: IProgressService;
	private _progress = new Map<number, { resolve: () => void; progress: IProgress<IProgressStep> }>();
	private readonly _proxy: ExtHostProgressShape;

	constructor(
		extHostContext: IExtHostContext,
		@IProgressService progressService: IProgressService,
		@ICommandService private readonly _commandService: ICommandService
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostProgress);
		this._progressService = progressService;
	}

	dispose(): void {
		this._progress.forEach(handle => handle.resolve());
		this._progress.clear();
	}

	async $startProgress(handle: number, options: IProgressOptionsDto, extensionId?: string): Promise<void> {
		const task = this._createTask(handle);
		let progressOptions: IProgressOptions = { ...options, legacyExtensionLinkParsing, telemetry: options.telemetryId ?? extensionNotificationTelemetry(extensionId, 'progress', options.notificationId) };

		if (options.location === ProgressLocation.Notification && extensionId) {
			const sourceIsUrgent = MainThreadProgress.URGENT_PROGRESS_SOURCES.includes(extensionId);
			const notificationOptions: IProgressNotificationOptions = {
				...progressOptions,
				priority: sourceIsUrgent ? NotificationPriority.URGENT : NotificationPriority.DEFAULT,
				location: ProgressLocation.Notification,
				// The Agents window registers the extensions management command only while it manages extensions
				secondaryActions: CommandsRegistry.getCommand('_extensions.manage') ? [withNotificationActionTelemetry(toAction({
					id: extensionId,
					label: localize('manageExtension', "Manage Extension"),
					// A notification keeps its actions after the command is unregistered
					run: () => CommandsRegistry.getCommand('_extensions.manage') ? this._commandService.executeCommand('_extensions.manage', extensionId) : undefined
				}), NotificationActionTelemetryId.ManageExtension)] : undefined
			};

			progressOptions = notificationOptions;
		}

		try {
			this._progressService.withProgress(progressOptions, task, () => this._proxy.$acceptProgressCanceled(handle));
		} catch (err) {
			// the withProgress-method will throw synchronously when invoked with bad options
			// which is then an enternal/extension error
			onUnexpectedExternalError(err);
		}
	}

	$progressReport(handle: number, message: IProgressStepDto): void {
		const entry = this._progress.get(handle);
		entry?.progress.report(message);
	}

	$progressEnd(handle: number): void {
		const entry = this._progress.get(handle);
		if (entry) {
			entry.resolve();
			this._progress.delete(handle);
		}
	}

	private _createTask(handle: number) {
		return (progress: IProgress<IProgressStep>) => {
			return new Promise<void>(resolve => {
				this._progress.set(handle, { resolve, progress });
			});
		};
	}
}
