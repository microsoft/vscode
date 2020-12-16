/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IWorkingCopyFileOperationParticipant } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { URI } from 'vs/base/common/uri';
import { FileOperation } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { LinkedList } from 'vs/base/common/linkedList';

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

	async participate(files: { source?: URI, target: URI }[], operation: FileOperation, undoRedoGroupId: number | undefined, isUndoing: boolean | undefined, token: CancellationToken | undefined): Promise<void> {
		const timeout = this.configurationService.getValue<number>('files.participants.timeout');
		if (timeout <= 0) {
			return; // disabled
		}

		// For each participant
		for (const participant of this.participants) {
			try {
				await participant.participate(files, operation, undoRedoGroupId, isUndoing, timeout, token ?? CancellationToken.None);
			} catch (err) {
				this.logService.warn(err);
			}
		}
	}

	dispose(): void {
		this.participants.clear();
	}
}
