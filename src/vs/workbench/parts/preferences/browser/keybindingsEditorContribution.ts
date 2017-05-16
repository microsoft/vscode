/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import { MarkedString } from 'vs/base/common/htmlContent';
import { KeyCode, KeyMod, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ServicesAccessor, registerEditorCommand } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { SmartSnippetInserter } from 'vs/workbench/parts/preferences/common/smartSnippetInserter';
import { DefineKeybindingOverlayWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import { FloatingClickWidget } from 'vs/workbench/parts/preferences/browser/preferencesWidgets';
import { parseTree, Node } from 'vs/base/common/json';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { EditorCommand } from 'vs/editor/common/config/config';

const NLS_LAUNCH_MESSAGE = nls.localize('defineKeybinding.start', "Define Keybinding");
const NLS_KB_LAYOUT_INFO_MESSAGE = nls.localize('defineKeybinding.kbLayoutInfoMessage', "For your current keyboard layout press ");
const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize('defineKeybinding.kbLayoutErrorMessage', "You won't be able to produce this key combination under your current keyboard layout.");

const INTERESTING_FILE = /keybindings\.json$/;

@editorContribution
export class DefineKeybindingController extends Disposable implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.defineKeybinding';

	public static get(editor: editorCommon.ICommonCodeEditor): DefineKeybindingController {
		return editor.getContribution<DefineKeybindingController>(DefineKeybindingController.ID);
	}

	private _keybindingEditorRenderer: KeybindingEditorRenderer;

	constructor(
		private _editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super();

		this._register(this._editor.onDidChangeModel(e => this._renderKeybindingEditor()));
		this._renderKeybindingEditor();
	}

	public getId(): string {
		return DefineKeybindingController.ID;
	}

	public get keybindingEditorRenderer(): KeybindingEditorRenderer {
		return this._keybindingEditorRenderer;
	}

	public dispose(): void {
		this._disposeKeybindingEditorRenderer();
		super.dispose();
	}

	private _renderKeybindingEditor(): void {
		if (isInterestingEditorModel(this._editor)) {
			if (!this._keybindingEditorRenderer) {
				this._keybindingEditorRenderer = this.instantiationService.createInstance(KeybindingEditorRenderer, this._editor);
			}
		} else {
			this._disposeKeybindingEditorRenderer();
		}
	}

	private _disposeKeybindingEditorRenderer(): void {
		if (this._keybindingEditorRenderer) {
			this._keybindingEditorRenderer.dispose();
			this._keybindingEditorRenderer = null;
		}
	}
}

export class KeybindingEditorRenderer extends Disposable {

	private _launchWidget: FloatingClickWidget;
	private _defineWidget: DefineKeybindingOverlayWidget;

	constructor(
		private _editor: ICodeEditor,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		super();
		this._launchWidget = this._register(this._instantiationService.createInstance(FloatingClickWidget, this._editor, NLS_LAUNCH_MESSAGE, DefineKeybindingCommand.ID));
		this._register(this._launchWidget.onClick(() => this.showDefineKeybindingWidget()));
		this._defineWidget = this._register(this._instantiationService.createInstance(DefineKeybindingOverlayWidget, this._editor));

		this._register(this._instantiationService.createInstance(KeybindingEditorDecorationsRenderer, this._editor));
		this._launchWidget.render();
	}

	public showDefineKeybindingWidget(): void {
		this._defineWidget.start().then(keybinding => this._onAccepted(keybinding));
	}

	private _onAccepted(keybinding: string): void {
		this._editor.focus();
		if (keybinding) {
			let regexp = new RegExp(/\\/g);
			let backslash = regexp.test(keybinding);
			if (backslash) {
				keybinding = keybinding.slice(0, -1) + '\\\\';
			}
			let snippetText = [
				'{',
				'\t"key": ' + JSON.stringify(keybinding) + ',',
				'\t"command": "${1:commandId}",',
				'\t"when": "${2:editorTextFocus}"',
				'}$0'
			].join('\n');

			let smartInsertInfo = SmartSnippetInserter.insertSnippet(this._editor.getModel(), this._editor.getPosition());
			snippetText = smartInsertInfo.prepend + snippetText + smartInsertInfo.append;
			this._editor.setPosition(smartInsertInfo.position);

			SnippetController2.get(this._editor).insert(snippetText, 0, 0);
		}
	}
}

export class KeybindingEditorDecorationsRenderer extends Disposable {

	private _updateDecorations: RunOnceScheduler;
	private _dec: string[] = [];

	constructor(
		private _editor: ICodeEditor,
		@IKeybindingService private _keybindingService: IKeybindingService,
	) {
		super();

		this._updateDecorations = this._register(new RunOnceScheduler(() => this._updateDecorationsNow(), 500));

		let model = this._editor.getModel();
		this._register(model.onDidChangeContent((e) => this._updateDecorations.schedule()));
		this._register(this._keybindingService.onDidUpdateKeybindings((e) => this._updateDecorations.schedule()));
		this._register({
			dispose: () => {
				this._dec = this._editor.deltaDecorations(this._dec, []);
				this._updateDecorations.cancel();
			}
		});
		this._updateDecorations.schedule();
	}

	private _updateDecorationsNow(): void {
		const model = this._editor.getModel();

		let newDecorations: editorCommon.IModelDeltaDecoration[] = [];

		const root = parseTree(model.getValue());
		if (root && Array.isArray(root.children)) {
			for (let i = 0, len = root.children.length; i < len; i++) {
				const entry = root.children[i];
				const dec = this._getDecorationForEntry(model, entry);
				if (dec !== null) {
					newDecorations.push(dec);
				}
			}
		}

		this._dec = this._editor.deltaDecorations(this._dec, newDecorations);
	}

	private _getDecorationForEntry(model: editorCommon.IModel, entry: Node): editorCommon.IModelDeltaDecoration {
		if (!Array.isArray(entry.children)) {
			return null;
		}
		for (let i = 0, len = entry.children.length; i < len; i++) {
			const prop = entry.children[i];
			if (prop.type !== 'property') {
				continue;
			}
			if (!Array.isArray(prop.children) || prop.children.length !== 2) {
				continue;
			}
			const key = prop.children[0];
			if (key.value !== 'key') {
				continue;
			}
			const value = prop.children[1];
			if (value.type !== 'string') {
				continue;
			}

			const resolvedKeybindings = this._keybindingService.resolveUserBinding(value.value);
			if (resolvedKeybindings.length === 0) {
				return this._createDecoration(true, null, model, value);
			}
			const resolvedKeybinding = resolvedKeybindings[0];
			if (!resolvedKeybinding.isWYSIWYG()) {
				return this._createDecoration(false, resolvedKeybinding.getLabel(), model, value);
			}
			const expectedUserSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
			if (!KeybindingEditorDecorationsRenderer._userSettingsFuzzyEquals(value.value, expectedUserSettingsLabel)) {
				return this._createDecoration(false, resolvedKeybinding.getLabel(), model, value);
			}
			return null;
		}
		return null;
	}

	static _userSettingsFuzzyEquals(a: string, b: string): boolean {
		a = a.trim().toLowerCase();
		b = b.trim().toLowerCase();

		if (a === b) {
			return true;
		}

		const [parsedA1, parsedA2] = KeybindingIO._readUserBinding(a);
		const [parsedB1, parsedB2] = KeybindingIO._readUserBinding(b);

		return (
			this._userBindingEquals(parsedA1, parsedB1)
			&& this._userBindingEquals(parsedA2, parsedB2)
		);
	}

	private static _userBindingEquals(a: SimpleKeybinding | ScanCodeBinding, b: SimpleKeybinding | ScanCodeBinding): boolean {
		if (a === null && b === null) {
			return true;
		}
		if (!a || !b) {
			return false;
		}

		if (a instanceof SimpleKeybinding && b instanceof SimpleKeybinding) {
			return a.equals(b);
		}

		if (a instanceof ScanCodeBinding && b instanceof ScanCodeBinding) {
			return a.equals(b);
		}

		return false;
	}

	private _createDecoration(isError: boolean, message: string, model: editorCommon.IModel, keyNode: Node): editorCommon.IModelDeltaDecoration {
		let msg: MarkedString[];
		let className: string;
		let beforeContentClassName: string;
		let overviewRulerColor: string;

		if (isError) {
			// this is the error case
			msg = [NLS_KB_LAYOUT_ERROR_MESSAGE];
			className = 'keybindingError';
			beforeContentClassName = 'inlineKeybindingError';
			overviewRulerColor = 'rgba(250, 100, 100, 0.6)';
		} else {
			// this is the info case
			msg = [NLS_KB_LAYOUT_INFO_MESSAGE];
			msg = msg.concat(message);
			className = 'keybindingInfo';
			beforeContentClassName = 'inlineKeybindingInfo';
			overviewRulerColor = 'rgba(100, 100, 250, 0.6)';
		}

		const startPosition = model.getPositionAt(keyNode.offset);
		const endPosition = model.getPositionAt(keyNode.offset + keyNode.length);
		const range = new Range(
			startPosition.lineNumber, startPosition.column,
			endPosition.lineNumber, endPosition.column
		);

		// icon + highlight + message decoration
		return {
			range: range,
			options: {
				stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
				className: className,
				beforeContentClassName: beforeContentClassName,
				hoverMessage: msg,
				overviewRuler: {
					color: overviewRulerColor,
					darkColor: overviewRulerColor,
					position: editorCommon.OverviewRulerLane.Right
				}
			}
		};
	}

}

class DefineKeybindingCommand extends EditorCommand {

	static ID = 'editor.action.defineKeybinding';

	constructor() {
		super({
			id: DefineKeybindingCommand.ID,
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.languageId.isEqualTo('json')),
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)
			}
		});
	}

	public runEditorCommand(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		if (!isInterestingEditorModel(editor)) {
			return;
		}
		let controller = DefineKeybindingController.get(editor);
		if (controller && controller.keybindingEditorRenderer) {
			controller.keybindingEditorRenderer.showDefineKeybindingWidget();
		}
	}
}

function isInterestingEditorModel(editor: editorCommon.ICommonCodeEditor): boolean {
	if (editor.getConfiguration().readOnly) {
		return false;
	}
	let model = editor.getModel();
	if (!model) {
		return false;
	}
	let url = model.uri.toString();
	return INTERESTING_FILE.test(url);
}

registerEditorCommand(new DefineKeybindingCommand());
