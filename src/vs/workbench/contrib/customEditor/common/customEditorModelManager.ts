/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICustomEditorModel, ICustomEditorModelManager } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { CustomEditorModel } from 'vs/workbench/contrib/customEditor/common/customEditorModel';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { ILabelService } from 'vs/platform/label/common/label';

export class CustomEditorModelManager implements ICustomEditorModelManager {
	private readonly _models = new Map<string, { readonly model: CustomEditorModel, readonly disposables: DisposableStore }>();

	constructor(
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@ILabelService private readonly _labelService: ILabelService
	) { }


	public get(resource: URI, viewType: string): ICustomEditorModel | undefined {
		return this._models.get(this.key(resource, viewType))?.model;
	}

	public async resolve(resource: URI, viewType: string): Promise<ICustomEditorModel> {
		const existing = this.get(resource, viewType);
		if (existing) {
			return existing;
		}

		const model = new CustomEditorModel(viewType, resource, this._labelService);
		const disposables = new DisposableStore();
		disposables.add(this._workingCopyService.registerWorkingCopy(model));
		this._models.set(this.key(resource, viewType), { model, disposables });
		return model;
	}

	public disposeModel(model: ICustomEditorModel): void {
		let foundKey: string | undefined;
		this._models.forEach((value, key) => {
			if (model === value.model) {
				value.disposables.dispose();
				value.model.dispose();
				foundKey = key;
			}
		});
		if (typeof foundKey === 'string') {
			this._models.delete(foundKey);
		}
		return;
	}

	public disposeAllModelsForView(viewType: string): void {
		this._models.forEach((value) => {
			if (value.model.viewType === viewType) {
				this.disposeModel(value.model);
			}
		});
	}

	private key(resource: URI, viewType: string): string {
		return `${resource.toString()}@@@${viewType}`;
	}
}
