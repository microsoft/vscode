/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { IDisposable, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { insert } from '../../../../base/common/arrays.js';
import { IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext } from './workingCopyFileService.js';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from './storedFileWorkingCopy.js';

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
