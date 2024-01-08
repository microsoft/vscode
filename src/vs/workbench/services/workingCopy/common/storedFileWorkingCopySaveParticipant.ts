/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { SaveReason } from 'vs/workbench/common/editor';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { insert } from 'vs/base/common/arrays';
import { IStoredFileWorkingCopySaveParticipant } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';

export class StoredFileWorkingCopySaveParticipant extends Disposable {

	private readonly saveParticipants: IStoredFileWorkingCopySaveParticipant[] = [];

	get length(): number { return this.saveParticipants.length; }

	constructor(
		@IProgressService private readonly progressService: IProgressService,
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	addSaveParticipant(participant: IStoredFileWorkingCopySaveParticipant): IDisposable {
		const remove = insert(this.saveParticipants, participant);

		return toDisposable(() => remove());
	}

	participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, token: CancellationToken): Promise<void> {
		const cts = new CancellationTokenSource(token);

		return this.progressService.withProgress({
			title: localize('saveParticipants', "Saving '{0}'", workingCopy.name),
			location: ProgressLocation.Notification,
			cancellable: true,
			delay: workingCopy.isDirty() ? 3000 : 5000
		}, async progress => {

			// undoStop before participation
			workingCopy.model?.pushStackElement();

			for (const saveParticipant of this.saveParticipants) {
				if (cts.token.isCancellationRequested || workingCopy.isDisposed()) {
					break;
				}

				try {
					const promise = saveParticipant.participate(workingCopy, context, progress, cts.token);
					await raceCancellation(promise, cts.token);
				} catch (err) {
					this.logService.warn(err);
				}
			}

			// undoStop after participation
			workingCopy.model?.pushStackElement();

			// Cleanup
			cts.dispose();
		}, () => {
			// user cancel
			cts.dispose(true);
		});
	}

	override dispose(): void {
		this.saveParticipants.splice(0, this.saveParticipants.length);

		super.dispose();
	}
}
