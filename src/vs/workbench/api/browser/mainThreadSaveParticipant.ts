/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { shouldSynchronizeModel } from 'vs/editor/common/model';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressStep, IProgress } from 'vs/platform/progress/common/progress';
import { extHostCustomer, IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { ITextFileSaveParticipant, ITextFileService, ITextFileEditorModel, ITextFileSaveParticipantContext } from 'vs/workbench/services/textfile/common/textfiles';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape } from '../common/extHost.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';
import { raceCancellationError } from 'vs/base/common/async';

class ExtHostSaveParticipant implements ITextFileSaveParticipant {

	private readonly _proxy: ExtHostDocumentSaveParticipantShape;

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	async participate(editorModel: ITextFileEditorModel, context: ITextFileSaveParticipantContext, _progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		if (!editorModel.textEditorModel || !shouldSynchronizeModel(editorModel.textEditorModel)) {
			// the model never made it to the extension
			// host meaning we cannot participate in its save
			return undefined;
		}

		const p = new Promise<any>((resolve, reject) => {

			setTimeout(
				() => reject(new Error(localize('timeout.onWillSave', "Aborted onWillSaveTextDocument-event after 1750ms"))),
				1750
			);
			this._proxy.$participateInSave(editorModel.resource, context.reason).then(values => {
				if (!values.every(success => success)) {
					return Promise.reject(new Error('listener failed'));
				}
				return undefined;
			}).then(resolve, reject);
		});

		return raceCancellationError(p, token);
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
@extHostCustomer
export class SaveParticipant {

	private _saveParticipantDisposable: IDisposable;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@ITextFileService private readonly _textFileService: ITextFileService
	) {
		this._saveParticipantDisposable = this._textFileService.files.addSaveParticipant(instantiationService.createInstance(ExtHostSaveParticipant, extHostContext));
	}

	dispose(): void {
		this._saveParticipantDisposable.dispose();
	}
}
