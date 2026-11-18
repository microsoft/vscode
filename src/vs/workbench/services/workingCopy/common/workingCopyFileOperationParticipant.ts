/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDisposable, Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IWorkingCopyFileOperationParticipant, SourceTargetPair, IFileOperationUndoRedoInfo } from './workingCopyFileService.js';
import { FileOperation } from '../../../../platform/files/common/files.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { LinkedList } from '../../../../base/common/linkedList.js';

export class WorkingCopyFileOperationParticipant extends Disposable {

	private readonly participants = new LinkedList<IWorkingCopyFileOperationParticipant>();

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	addFileOperationParticipant(participant: IWorkingCopyFileOperationParticipant): IDisposable {
		const remove = this.participants.push(participant);

		return toDisposable(() => remove());
	}

	async participate(files: SourceTargetPair[], operation: FileOperation, undoInfo: IFileOperationUndoRedoInfo | undefined, token: CancellationToken): Promise<void> {
		const timeout = this.configurationService.getValue<number>('files.participants.timeout');
		if (typeof timeout !== 'number' || timeout <= 0) {
			return; // disabled
		}

		// For each participant
		for (const participant of this.participants) {
			try {
				await participant.participate(files, operation, undoInfo, timeout, token);
			} catch (err) {
				this.logService.warn(err);
			}
		}
	}

	override dispose(): void {
		this.participants.clear();

		super.dispose();
	}
}
