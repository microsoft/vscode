/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IDisposable, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext } from './workingCopyFileService.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from './storedFileWorkingCopy.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';

export class StoredFileWorkingCopySaveParticipant extends Disposable {

	private readonly saveParticipants = new LinkedList<IStoredFileWorkingCopySaveParticipant>();

	get length(): number { return this.saveParticipants.size; }

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();
	}

	addSaveParticipant(participant: IStoredFileWorkingCopySaveParticipant): IDisposable {
		const remove = this.saveParticipants.push(participant);

		return toDisposable(() => remove());
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		const cts = new CancellationTokenSource(token);

		// undoStop before participation
		workingCopy.model?.pushStackElement();

		// report to the "outer" progress
		progress.report({
			message: localize('saveParticipants1', "Running Code Actions and Formatters...")
		});

		let bubbleCancel = false;

		// create an "inner" progress to allow to skip over long running save participants
		await this.progressService.withProgress({
			priority: NotificationPriority.URGENT,
			location: ProgressLocation.Notification,
			cancellable: localize('skip', "Skip"),
			delay: workingCopy.isDirty() ? 5000 : 3000
		}, async progress => {

			const participants = Array.from(this.saveParticipants).sort((a, b) => {
				const aValue = a.ordinal ?? 0;
				const bValue = b.ordinal ?? 0;
				return aValue - bValue;
			});

			for (const saveParticipant of participants) {
				if (cts.token.isCancellationRequested || workingCopy.isDisposed()) {
					break;
				}

				try {
					const promise = saveParticipant.participate(workingCopy, context, progress, cts.token);
					await raceCancellation(promise, cts.token);
				} catch (err) {
					if (!isCancellationError(err)) {
						this.logService.error(err);
					} else if (!cts.token.isCancellationRequested) {
						// we see a cancellation error BUT the token didn't signal it
						// this means the participant wants the save operation to be cancelled
						cts.cancel();
						bubbleCancel = true;
					}
				}
			}
		}, () => {
			cts.cancel();
		});

		// undoStop after participation
		workingCopy.model?.pushStackElement();

		cts.dispose();

		if (bubbleCancel) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		this.saveParticipants.clear();

		super.dispose();
	}
}
