/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { insert } from 'vs/base/common/arrays';
import { IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';

export class StoredFileWorkingCopySaveParticipant extends Disposable {

	private readonly saveParticipants: IStoredFileWorkingCopySaveParticipant[] = [];

	get length(): number { return this.saveParticipants.length; }

	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
	}

	addSaveParticipant(participant: IStoredFileWorkingCopySaveParticipant): IDisposable {
		const remove = insert(this.saveParticipants, participant);

		return toDisposable(() => remove());
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		// undoStop before participation
		workingCopy.model?.pushStackElement();

		for (const saveParticipant of this.saveParticipants) {
			if (token.isCancellationRequested || workingCopy.isDisposed()) {
				break;
			}

			try {
				const promise = saveParticipant.participate(workingCopy, context, progress, token);
				await raceCancellation(promise, token);
			} catch (err) {
				this.logService.warn(err);
			}
		}

		// undoStop after participation
		workingCopy.model?.pushStackElement();
	}

	override dispose(): void {
		this.saveParticipants.splice(0, this.saveParticipants.length);

		super.dispose();
	}
}
