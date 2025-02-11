/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProgress, IProgressService, IProgressStep, ProgressLocation, IProgressOptions, IProgressNotificationOptions } from '../../../platform/progress/common/progress.js';
import { MainThreadProgressShape, MainContext, ExtHostProgressShape, ExtHostContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ICommandService } from '../../../platform/commands/common/commands.js';
import { localize } from '../../../nls.js';
import { onUnexpectedExternalError } from '../../../base/common/errors.js';
import { toAction } from '../../../base/common/actions.js';

@extHostNamedCustomer(MainContext.MainThreadProgress)
export class MainThreadProgress implements MainThreadProgressShape {

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

	async $startProgress(handle: number, options: IProgressOptions, extensionId?: string): Promise<void> {
		const task = this._createTask(handle);

		if (options.location === ProgressLocation.Notification && extensionId) {
			const notificationOptions: IProgressNotificationOptions = {
				...options,
				location: ProgressLocation.Notification,
				secondaryActions: [toAction({
					id: extensionId,
					label: localize('manageExtension', "Manage Extension"),
					run: () => this._commandService.executeCommand('_extensions.manage', extensionId)
				})]
			};

			options = notificationOptions;
		}

		try {
			this._progressService.withProgress(options, task, () => this._proxy.$acceptProgressCanceled(handle));
		} catch (err) {
			// the withProgress-method will throw synchronously when invoked with bad options
			// which is then an enternal/extension error
			onUnexpectedExternalError(err);
		}
	}

	$progressReport(handle: number, message: IProgressStep): void {
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
