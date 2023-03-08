/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';
import { Lazy } from 'vs/base/common/lazy';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { CodeActionTriggerType } from 'vs/editor/common/languages';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { applyCodeAction, ApplyCodeActionReason } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionUi } from 'vs/editor/contrib/codeAction/browser/codeActionUi';
import { MessageController } from 'vs/editor/contrib/message/browser/messageController';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { CodeActionAutoApply, CodeActionFilter, CodeActionItem, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource } from '../common/types';
import { CodeActionModel } from './codeActionModel';


export class CodeActionController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.codeActionController';

	public static get(editor: ICodeEditor): CodeActionController | null {
		return editor.getContribution<CodeActionController>(CodeActionController.ID);
	}

	private readonly _editor: ICodeEditor;
	private readonly _model: CodeActionModel;
	private readonly _ui: Lazy<CodeActionUi>;

	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorProgressService progressService: IEditorProgressService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService
	) {
		super();

		this._editor = editor;

		this._model = this._register(new CodeActionModel(this._editor, languageFeaturesService.codeActionProvider, markerService, contextKeyService, progressService));

		this._register(this._model.onDidChangeState(newState => this._ui.value.update(newState)));

		this._ui = new Lazy(() => this._register(_instantiationService.createInstance(CodeActionUi, editor, {
			applyCodeAction: async (action, retrigger, preview) => {
				try {
					await this._applyCodeAction(action, preview);
				} finally {
					if (retrigger) {
						this._trigger({ type: CodeActionTriggerType.Auto, triggerAction: CodeActionTriggerSource.QuickFix, filter: {} });
					}
				}
			}
		}))
		);
	}

	public showCodeActions(_trigger: CodeActionTrigger, actions: CodeActionSet, at: IAnchor | IPosition) {
		return this._ui.value.showCodeActionList(actions, at, { includeDisabledActions: false, fromLightbulb: false });
	}

	public manualTriggerAtCurrentPosition(
		notAvailableMessage: string,
		triggerAction: CodeActionTriggerSource,
		filter?: CodeActionFilter,
		autoApply?: CodeActionAutoApply,
	): void {
		if (!this._editor.hasModel()) {
			return;
		}

		MessageController.get(this._editor)?.closeMessage();
		const triggerPosition = this._editor.getPosition();
		this._trigger({ type: CodeActionTriggerType.Invoke, triggerAction, filter, autoApply, context: { notAvailableMessage, position: triggerPosition } });
	}

	private _trigger(trigger: CodeActionTrigger) {
		return this._model.trigger(trigger);
	}

	private _applyCodeAction(action: CodeActionItem, preview: boolean): Promise<void> {
		return this._instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.FromCodeActions, { preview, editor: this._editor });
	}
}
