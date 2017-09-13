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
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { ICommonCodeEditor, IEditorContribution } from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { QuickFixContextMenu } from './quickFixWidget';
import { LightBulbWidget } from './lightBulbWidget';
import { QuickFixModel, QuickFixComputeEvent } from './quickFixModel';

@editorContribution
export class QuickFixController implements IEditorContribution {

	private static ID = 'editor.contrib.quickFixController';

	public static get(editor: ICommonCodeEditor): QuickFixController {
		return editor.getContribution<QuickFixController>(QuickFixController.ID);
	}

	private _editor: ICodeEditor;
	private _model: QuickFixModel;
	private _quickFixContextMenu: QuickFixContextMenu | undefined;
	private _lightBulbWidget: LightBulbWidget | undefined;
	private _disposables: IDisposable[] = [];
	private enabled: boolean = false;


	constructor(
		editor: ICodeEditor,
		@IMarkerService markerService: IMarkerService,
		@ICommandService private readonly _commandService: ICommandService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService
	) {
		this._editor = editor;
		this._model = new QuickFixModel(this._editor, markerService);

		this._disposables.push(
			this._editor.onDidChangeConfiguration(() => this.onEditorConfigurationChange()),
			this._model.onDidChangeFixes(e => this._onQuickFixEvent(e))
		);

		this.onEditorConfigurationChange();
	}

	public dispose(): void {
		this._model.dispose();
		dispose(this._disposables);
	}

	private get lightBulbWidget(): LightBulbWidget {
		if (!this._lightBulbWidget) {
			this._lightBulbWidget = new LightBulbWidget(this._editor);
			this._disposables.push(
				this._lightBulbWidget.onClick(this._handleLightBulbSelect, this),
				this._keybindingService.onDidUpdateKeybindings(this._updateLightBulbTitle, this)
			);
			this._updateLightBulbTitle();
		}
		return this._lightBulbWidget;
	}

	private get quickFixContextMenu(): QuickFixContextMenu {
		if (!this._quickFixContextMenu) {
			this._quickFixContextMenu = new QuickFixContextMenu(this._editor, this._contextMenuService, this._commandService);
			this._disposables.push(this._quickFixContextMenu.onDidExecuteCodeAction(_ => {
				this._model.trigger('auto');
			}));
		}
		return this._quickFixContextMenu;
	}

	private _onQuickFixEvent(e: QuickFixComputeEvent): void {
		if (e && e.type === 'manual') {
			this.quickFixContextMenu.show(e.fixes, e.position);
		} else if (e && e.fixes) {
			// auto magically triggered
			// * update an existing list of code actions
			// * manage light bulb
			if (this.quickFixContextMenu.isVisible) {
				this.quickFixContextMenu.show(e.fixes, e.position);
			} else {
				if (this.enabled) {
					this.lightBulbWidget.model = e;
				}
			}
		} else {
			if (this._lightBulbWidget) {
				this._lightBulbWidget.hide();
			}
		}
	}

	public getId(): string {
		return QuickFixController.ID;
	}

	private _handleLightBulbSelect(coords: { x: number, y: number }): void {
		this.quickFixContextMenu.show(this.lightBulbWidget.model.fixes, coords);
	}

	public triggerFromEditorSelection(): void {
		this._model.trigger('manual');
	}

	private _updateLightBulbTitle(): void {
		if (!this._lightBulbWidget) {
			return;
		}

		const kb = this._keybindingService.lookupKeybinding(QuickFixAction.Id);
		let title: string;
		if (kb) {
			title = nls.localize('quickFixWithKb', "Show Fixes ({0})", kb.getLabel());
		} else {
			title = nls.localize('quickFix', "Show Fixes");
		}
		this.lightBulbWidget.title = title;
	}

	private onEditorConfigurationChange(): void {
		this.enabled = this._editor.getConfiguration().contribInfo.lightbulbEnabled;

		if (!this.enabled) {
			if (this._lightBulbWidget) {
				this._lightBulbWidget.dispose();
				this._lightBulbWidget = undefined;
			}
		}
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
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCodeActionsProvider),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
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
