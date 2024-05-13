/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressStep, IProgress } from 'vs/platform/progress/common/progress';
import { extHostCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ExtHostContext, ExtHostNotebookDocumentSaveParticipantShape } from '../common/extHost.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';
import { raceCancellationError } from 'vs/base/common/async';
import { IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext, IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';

class ExtHostNotebookDocumentSaveParticipant implements IStoredFileWorkingCopySaveParticipant {

	private readonly _proxy: ExtHostNotebookDocumentSaveParticipantShape;

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostNotebookDocumentSaveParticipant);
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, _progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return undefined;
		}

		let _warningTimeout: any;

		const p = new Promise<any>((resolve, reject) => {

			_warningTimeout = setTimeout(
				() => reject(new Error(localize('timeout.onWillSave', "Aborted onWillSaveNotebookDocument-event after 1750ms"))),
				1750
			);
			this._proxy.$participateInSave(workingCopy.resource, context.reason, token).then(_ => {
				clearTimeout(_warningTimeout);
				return undefined;
			}).then(resolve, reject);
		});

		return raceCancellationError(p, token);
	}
}

@extHostCustomer
export class SaveParticipant {

	private _saveParticipantDisposable: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService
	) {
		this._saveParticipantDisposable = this.workingCopyFileService.addSaveParticipant(instantiationService.createInstance(ExtHostNotebookDocumentSaveParticipant, extHostContext));
	}

	dispose(): void {
		this._saveParticipantDisposable.dispose();
	}
}
