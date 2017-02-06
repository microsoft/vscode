/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ICommonCodeEditor, EditorContextKeys, ModeContextKeys, IEditorContribution } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { QuickFixContextMenu } from 'vs/editor/contrib/quickFix/browser/quickFixWidget';
import { LightBulbWidget } from 'vs/editor/contrib/quickFix/browser/lightBulbWidget';
import { QuickFixModel, QuickFixComputeEvent } from 'vs/editor/contrib/quickFix/common/quickFixModel';

@editorContribution
export class QuickFixController implements IEditorContribution {

	private static ID = 'editor.contrib.quickFixController';

	public static get(editor: ICommonCodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private _editor: ICodeEditor;
	private _model: QuickFixModel;
	private _quickFixContextMenu: QuickFixContextMenu;
	private _lightBulbWidget: LightBulbWidget;
	private _disposables: IDisposable[] = [];

	constructor(editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICommandService commandService: ICommandService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService private _keybindingService: IKeybindingService
	) {
		this._editor = editor;
		this._model = new QuickFixModel(this._editor, markerService);
		this._quickFixContextMenu = new QuickFixContextMenu(editor, contextMenuService, commandService);
		this._lightBulbWidget = new LightBulbWidget(editor);

		this._updateLightBulbTitle();

		this._disposables.push(
			this._lightBulbWidget.onClick(this._handleLightBulbSelect, this),
			this._model.onDidChangeFixes(e => this._onQuickFixEvent(e)),
			this._keybindingService.onDidUpdateKeybindings(this._updateLightBulbTitle, this)
		);
	}

	public dispose(): void {
		this._model.dispose();
		dispose(this._disposables);
	}

	private _onQuickFixEvent(e: QuickFixComputeEvent): void {
		if (e && e.type === 'manual') {
			this._quickFixContextMenu.show(e.fixes, e.position);

		} else if (e && e.fixes) {
			// auto magically triggered
			// * update an existing list of code actions
			// * manage light bulb
			if (this._quickFixContextMenu.isVisible) {
				this._quickFixContextMenu.show(e.fixes, e.position);
			} else {
				this._lightBulbWidget.model = e;
			}
		} else {
			this._lightBulbWidget.hide();
		}
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private _handleLightBulbSelect(coords: { x: number, y: number }): void {
		this._quickFixContextMenu.show(this._lightBulbWidget.model.fixes, coords);
	}

	public triggerFromEditorSelection(): void {
		this._model.triggerManual();
	}

	private _updateLightBulbTitle(): void {
		const [kb] = this._keybindingService.lookupKeybindings(QuickFixAction.Id);
		let title: string;
		if (kb) {
			title = nls.localize('quickFixWithKb', "Show Fixes ({0})", this._keybindingService.getLabelFor(kb));
		} else {
			title = nls.localize('quickFix', "Show Fixes");
		}
		this._lightBulbWidget.getDomNode().title = title;
	}
}

@editorAction
export class QuickFixAction extends EditorAction {

	static Id = 'editor.action.quickFix';

	constructor() {
		super({
			id: QuickFixAction.Id,
			label: nls.localize('quickfix.trigger.label', "Quick Fix"),
			alias: 'Quick Fix',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, ModeContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.CtrlCmd | KeyCode.US_DOT
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		let controller = QuickFixController.get(editor);
		if (controller) {
			controller.triggerFromEditorSelection();
		}
	}
}
