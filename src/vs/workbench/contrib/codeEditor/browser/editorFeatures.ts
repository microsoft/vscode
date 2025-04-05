/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { getEditorFeatures } from '../../../../editor/common/editorFeatures.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';

class EditorFeaturesInstantiator extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.editorFeaturesInstantiator';

	private _instantiated = false;

	constructor(
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this._register(codeEditorService.onWillCreateCodeEditor(() => this._instantiate()));
		this._register(codeEditorService.onWillCreateDiffEditor(() => this._instantiate()));
		if (codeEditorService.listCodeEditors().length > 0 || codeEditorService.listDiffEditors().length > 0) {
			this._instantiate();
		}
	}

	private _instantiate(): void {
		if (this._instantiated) {
			return;
		}
		this._instantiated = true;

		// Instantiate all editor features
		const editorFeatures = getEditorFeatures();
		for (const feature of editorFeatures) {
			try {
				const instance = this._instantiationService.createInstance(feature);
				if (typeof (<IDisposable>instance).dispose === 'function') {
					this._register((<IDisposable>instance));
				}
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}
}

registerWorkbenchContribution2(EditorFeaturesInstantiator.ID, EditorFeaturesInstantiator, WorkbenchPhase.BlockRestore);
