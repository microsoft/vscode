/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellation } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProgress, IProgressService, IProgressStep, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ITextFileSaveParticipant, ITextFileEditorModel, ITextFileSaveParticipantContext } from './textfiles.js';
import { IDisposable, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { LinkedList } from '../../../../base/common/linkedList.js';
import { localize } from '../../../../nls.js';
import { NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';

export class TextFileSaveParticipant extends Disposable {

	private readonly saveParticipants = new LinkedList<ITextFileSaveParticipant>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super();
	}

	addSaveParticipant(participant: ITextFileSaveParticipant): IDisposable {
		const remove = this.saveParticipants.push(participant);

		return toDisposable(() => remove());
	}

	async participate(model: ITextFileEditorModel, context: ITextFileSaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		const cts = new CancellationTokenSource(token);

		// undoStop before participation
		model.textEditorModel?.pushStackElement();

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
			delay: model.isDirty() ? 5000 : 3000
		}, async progress => {
			for (const saveParticipant of this.saveParticipants) {
				if (cts.token.isCancellationRequested || !model.textEditorModel /* disposed */) {
					break;
				}

				try {
					const promise = saveParticipant.participate(model, context, progress, cts.token);
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
		model.textEditorModel?.pushStackElement();

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
