/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancelablePromise } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { CodeAction } from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { QuickFixAction } from './codeActionCommands';
import { CodeActionModel, CodeActionsState } from './codeActionModel';
import { CodeActionAutoApply, CodeActionFilter } from './codeActionTrigger';
import { CodeActionContextMenu } from './codeActionWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { applyCodeAction } from 'vs/editor/contrib/codeAction/codeAction';

export class CodeActionController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.quickFixController';

	public static get(editor: ICodeEditor): CodeActionController {
		return editor.getContribution<CodeActionController>(CodeActionController.ID);
	}

	private _editor: ICodeEditor;
	private _model: CodeActionModel;
	private _codeActionContextMenu: CodeActionContextMenu;
	private _lightBulbWidget: LightBulbWidget;
	private _disposables: IDisposable[] = [];

	private _activeRequest: CancelablePromise<CodeAction[]> | undefined;

	constructor(editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProgressService progressService: IProgressService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private readonly _commandService: ICommandService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
	) {
		this._editor = editor;
		this._model = new CodeActionModel(this._editor, markerService, contextKeyService, progressService);
		this._codeActionContextMenu = new CodeActionContextMenu(editor, contextMenuService, action => this._onApplyCodeAction(action));
		this._lightBulbWidget = new LightBulbWidget(editor);

		this._updateLightBulbTitle();

		this._disposables.push(
			this._codeActionContextMenu.onDidExecuteCodeAction(_ => this._model.trigger({ type: 'auto', filter: {} })),
			this._lightBulbWidget.onClick(this._handleLightBulbSelect, this),
			this._model.onDidChangeState(e => this._onDidChangeCodeActionsState(e)),
			this._keybindingService.onDidUpdateKeybindings(this._updateLightBulbTitle, this)
		);
	}

	public dispose(): void {
		this._model.dispose();
		dispose(this._disposables);
	}

	private _onDidChangeCodeActionsState(newState: CodeActionsState.State): void {
		if (this._activeRequest) {
			this._activeRequest.cancel();
			this._activeRequest = undefined;
		}

		if (newState.type === CodeActionsState.Type.Triggered) {
			this._activeRequest = newState.actions;

			if (newState.trigger.filter && newState.trigger.filter.kind) {
				// Triggered for specific scope
				newState.actions.then(fixes => {
					if (fixes.length > 0) {
						// Apply if we only have one action or requested autoApply
						if (newState.trigger.autoApply === CodeActionAutoApply.First || (newState.trigger.autoApply === CodeActionAutoApply.IfSingle && fixes.length === 1)) {
							this._onApplyCodeAction(fixes[0]);
							return;
						}
					}
					this._codeActionContextMenu.show(newState.actions, newState.position);

				}).catch(onUnexpectedError);
			} else if (newState.trigger.type === 'manual') {
				this._codeActionContextMenu.show(newState.actions, newState.position);
			} else {
				// auto magically triggered
				// * update an existing list of code actions
				// * manage light bulb
				if (this._codeActionContextMenu.isVisible) {
					this._codeActionContextMenu.show(newState.actions, newState.position);
				} else {
					this._lightBulbWidget.tryShow(newState);
				}
			}
		} else {
			this._lightBulbWidget.hide();
		}
	}

	public getId(): string {
		return CodeActionController.ID;
	}

	private _handleLightBulbSelect(e: { x: number, y: number, state: CodeActionsState.Triggered }): void {
		this._codeActionContextMenu.show(e.state.actions, e);
	}

	public triggerFromEditorSelection(filter?: CodeActionFilter, autoApply?: CodeActionAutoApply): Promise<CodeAction[] | undefined> {
		return this._model.trigger({ type: 'manual', filter, autoApply });
	}

	private _updateLightBulbTitle(): void {
		const kb = this._keybindingService.lookupKeybinding(QuickFixAction.Id);
		let title: string;
		if (kb) {
			title = nls.localize('quickFixWithKb', "Show Fixes ({0})", kb.getLabel());
		} else {
			title = nls.localize('quickFix', "Show Fixes");
		}
		this._lightBulbWidget.title = title;
	}

	private _onApplyCodeAction(action: CodeAction): Promise<void> {
		return applyCodeAction(action, this._bulkEditService, this._commandService, this._editor);
	}
}