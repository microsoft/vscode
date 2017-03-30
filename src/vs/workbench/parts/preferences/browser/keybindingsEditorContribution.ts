/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { RunOnceScheduler } from 'vs/base/common/async';
import { MarkedString } from 'vs/base/common/htmlContent';
import { KeyCode, KeyMod, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { CodeSnippet } from 'vs/editor/contrib/snippet/common/snippet';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { SmartSnippetInserter } from 'vs/workbench/parts/preferences/common/smartSnippetInserter';
import { DefineKeybindingOverlayWidget } from 'vs/workbench/parts/preferences/browser/keybindingWidgets';
import { parseTree, Node } from 'vs/base/common/json';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { ScanCodeBinding } from 'vs/workbench/services/keybinding/common/scanCode';

import EditorContextKeys = editorCommon.EditorContextKeys;

const NLS_LAUNCH_MESSAGE = nls.localize('defineKeybinding.start', "Define Keybinding");
const NLS_KB_LAYOUT_INFO_MESSAGE = nls.localize('defineKeybinding.kbLayoutInfoMessage', "For your current keyboard layout press ");
const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize('defineKeybinding.kbLayoutErrorMessage', "You won't be able to produce this key combination under your current keyboard layout.");

const INTERESTING_FILE = /keybindings\.json$/;

@editorContribution
export class DefineKeybindingController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.defineKeybinding';

	public static get(editor: editorCommon.ICommonCodeEditor): DefineKeybindingController {
		return editor.getContribution<DefineKeybindingController>(DefineKeybindingController.ID);
	}

	private _editor: ICodeEditor;
	private _keybindingService: IKeybindingService;
	private _launchWidget: DefineKeybindingLauncherWidget;
	private _defineWidget: DefineKeybindingOverlayWidget;
	private _toDispose: IDisposable[];
	private _modelToDispose: IDisposable[];
	private _updateDecorations: RunOnceScheduler;

	constructor(
		editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this._editor = editor;
		this._keybindingService = keybindingService;
		this._toDispose = [];
		this._launchWidget = new DefineKeybindingLauncherWidget(this._editor, keybindingService, () => this.launch());
		this._defineWidget = instantiationService.createInstance(DefineKeybindingOverlayWidget, this._editor);

		this._toDispose.push(this._editor.onDidChangeConfiguration((e) => {
			if (isInterestingEditorModel(this._editor)) {
				this._launchWidget.show();
			} else {
				this._launchWidget.hide();
			}
		}));
		this._toDispose.push(this._editor.onDidChangeModel((e) => {
			if (isInterestingEditorModel(this._editor)) {
				this._launchWidget.show();
			} else {
				this._launchWidget.hide();
			}
			this._onModel();
		}));

		this._updateDecorations = new RunOnceScheduler(() => this._updateDecorationsNow(), 500);
		this._toDispose.push(this._updateDecorations);

		this._modelToDispose = [];
		this._onModel();
	}

	public getId(): string {
		return DefineKeybindingController.ID;
	}

	public dispose(): void {
		this._modelToDispose = dispose(this._modelToDispose);
		this._toDispose = dispose(this._toDispose);
		this._launchWidget.dispose();
		this._launchWidget = null;
		this._defineWidget.dispose();
		this._defineWidget = null;
	}

	public launch(): void {
		if (isInterestingEditorModel(this._editor)) {
			this._defineWidget.start().then(keybinding => this._onAccepted(keybinding));
		}
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

			SnippetController.get(this._editor).run(CodeSnippet.fromTextmate(snippetText), 0, 0);
		}
	}

	private _onModel(): void {
		this._modelToDispose = dispose(this._modelToDispose);

		let model = this._editor.getModel();
		if (!model) {
			return;
		}

		let url = model.uri.toString();
		if (!INTERESTING_FILE.test(url)) {
			return;
		}

		this._modelToDispose.push(model.onDidChangeContent((e) => this._updateDecorations.schedule()));
		this._modelToDispose.push(this._keybindingService.onDidUpdateKeybindings((e) => this._updateDecorations.schedule()));
		this._modelToDispose.push({
			dispose: () => {
				this._dec = this._editor.deltaDecorations(this._dec, []);
				this._updateDecorations.cancel();
			}
		});
		this._updateDecorations.schedule();
	}

	private _dec: string[] = [];
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
			if (!DefineKeybindingController._userSettingsFuzzyEquals(value.value, expectedUserSettingsLabel)) {
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

class DefineKeybindingLauncherWidget implements IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingLauncherWidget';

	private _editor: ICodeEditor;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];
	private _isVisible: boolean;

	constructor(editor: ICodeEditor, keybindingService: IKeybindingService, onLaunch: () => void) {
		this._editor = editor;
		this._domNode = document.createElement('div');
		this._domNode.className = 'defineKeybindingLauncher';
		this._domNode.style.display = 'none';
		this._isVisible = false;
		let keybinding = keybindingService.lookupKeybinding(DefineKeybindingAction.ID);
		let extra = '';
		if (keybinding) {
			extra += ' (' + keybinding.getLabel() + ')';
		}
		this._domNode.appendChild(document.createTextNode(NLS_LAUNCH_MESSAGE + extra));

		this._toDispose = [];
		this._toDispose.push(dom.addDisposableListener(this._domNode, 'click', (e) => {
			onLaunch();
		}));

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = dispose(this._toDispose);
	}

	public show(): void {
		if (this._isVisible) {
			return;
		}
		this._domNode.style.display = 'block';
		this._isVisible = true;
		this._editor.layoutOverlayWidget(this);
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._domNode.style.display = 'none';
		this._isVisible = false;
		this._editor.layoutOverlayWidget(this);
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return DefineKeybindingLauncherWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: this._isVisible ? OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER : null
		};
	}
}

@editorAction
export class DefineKeybindingAction extends EditorAction {

	static ID = 'editor.action.defineKeybinding';

	constructor() {
		super({
			id: DefineKeybindingAction.ID,
			label: nls.localize('DefineKeybindingAction', "Define Keybinding"),
			alias: 'Define Keybinding',
			precondition: ContextKeyExpr.and(EditorContextKeys.Writable, EditorContextKeys.LanguageId.isEqualTo('json')),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		if (!isInterestingEditorModel(editor)) {
			return;
		}
		let controller = DefineKeybindingController.get(editor);
		if (controller) {
			controller.launch();
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
