/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./defineKeybinding';
import * as nls from 'vs/nls';
import { RunOnceScheduler } from 'vs/base/common/async';
import { MarkedString } from 'vs/base/common/htmlContent';
import { Keybinding, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import * as dom from 'vs/base/browser/dom';
import { renderHtml } from 'vs/base/browser/htmlContentRenderer';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { StyleMutator } from 'vs/base/browser/styleMutator';
import { IOSupport } from 'vs/platform/keybinding/common/keybindingResolver';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { CodeSnippet } from 'vs/editor/contrib/snippet/common/snippet';
import { SnippetController } from 'vs/editor/contrib/snippet/common/snippetController';
import { SmartSnippetInserter } from 'vs/editor/contrib/defineKeybinding/common/smartSnippetInserter';

import EditorContextKeys = editorCommon.EditorContextKeys;

const NLS_LAUNCH_MESSAGE = nls.localize('defineKeybinding.start', "Define Keybinding");
const NLS_DEFINE_MESSAGE = nls.localize('defineKeybinding.initial', "Press desired key combination and ENTER");
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
	private _defineWidget: DefineKeybindingWidget;
	private _toDispose: IDisposable[];
	private _modelToDispose: IDisposable[];
	private _updateDecorations: RunOnceScheduler;

	constructor(
		editor: ICodeEditor,
		@IKeybindingService keybindingService: IKeybindingService
	) {
		this._editor = editor;
		this._keybindingService = keybindingService;
		this._toDispose = [];
		this._launchWidget = new DefineKeybindingLauncherWidget(this._editor, keybindingService, () => this.launch());
		this._defineWidget = new DefineKeybindingWidget(this._editor, keybindingService, (keybinding) => this._onAccepted(keybinding));

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
			this._defineWidget.start();
		}
	}

	private _onAccepted(keybinding: string): void {
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
		let model = this._editor.getModel();
		let regex = KeybindingLabels.getUserSettingsKeybindingRegex();

		var m = model.findMatches(regex, false, true, false, false, false).map(m => m.range);

		let data = m.map((range) => {
			let text = model.getValueInRange(range);

			let strKeybinding = text.substring(1, text.length - 1);
			strKeybinding = strKeybinding.replace(/\\\\/g, '\\');

			let numKeybinding = IOSupport.readKeybinding(strKeybinding);

			let keybinding = new Keybinding(numKeybinding);

			return {
				strKeybinding: strKeybinding,
				keybinding: keybinding,
				usLabel: KeybindingLabels._toUSLabel(keybinding),
				label: this._keybindingService.getLabelFor(keybinding),
				range: range
			};
		});

		data = data.filter((entry) => {
			return (entry.usLabel !== entry.label);
		});

		let newDecorations: editorCommon.IModelDeltaDecoration[] = [];
		data.forEach((item) => {
			let msg: MarkedString[];
			let className: string;
			let inlineClassName: string;
			let overviewRulerColor: string;

			if (!item.label) {
				// this is the error case
				msg = [NLS_KB_LAYOUT_ERROR_MESSAGE];
				className = 'keybindingError';
				inlineClassName = 'inlineKeybindingError';
				overviewRulerColor = 'rgba(250, 100, 100, 0.6)';
			} else {
				// this is the info case
				msg = [NLS_KB_LAYOUT_INFO_MESSAGE];
				msg = msg.concat(this._keybindingService.getLabelFor(item.keybinding));
				className = 'keybindingInfo';
				inlineClassName = 'inlineKeybindingInfo';
				overviewRulerColor = 'rgba(100, 100, 250, 0.6)';
			}

			// icon decoration
			newDecorations.push({
				range: new Range(item.range.startLineNumber, item.range.startColumn, item.range.startLineNumber, item.range.startColumn + 1),
				options: {
					stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					inlineClassName: inlineClassName
				}
			});

			// highlight + message decoration
			newDecorations.push({
				range: item.range,
				options: {
					stickiness: editorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: className,
					hoverMessage: msg,
					overviewRuler: {
						color: overviewRulerColor,
						darkColor: overviewRulerColor,
						position: editorCommon.OverviewRulerLane.Right
					}
				}
			});
		});

		this._dec = this._editor.deltaDecorations(this._dec, newDecorations);
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
		let keybinding = keybindingService.lookupKeybindings(DefineKeybindingAction.ID);
		let extra = '';
		if (keybinding.length > 0) {
			extra += ' (' + keybindingService.getLabelFor(keybinding[0]) + ')';
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


class DefineKeybindingWidget implements IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingWidget';
	private static WIDTH = 340;
	private static HEIGHT = 90;

	private _editor: ICodeEditor;
	private _keybindingService: IKeybindingService;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];

	private _messageNode: HTMLElement;
	private _inputNode: HTMLInputElement;
	private _outputNode: HTMLElement;

	private _lastKeybinding: Keybinding;
	private _onAccepted: (keybinding: string) => void;
	private _isVisible: boolean;

	constructor(editor: ICodeEditor, keybindingService: IKeybindingService, onAccepted: (keybinding: string) => void) {
		this._editor = editor;
		this._keybindingService = keybindingService;
		this._onAccepted = onAccepted;
		this._toDispose = [];
		this._lastKeybinding = null;

		this._domNode = document.createElement('div');
		this._domNode.className = 'defineKeybindingWidget';
		StyleMutator.setWidth(this._domNode, DefineKeybindingWidget.WIDTH);
		StyleMutator.setHeight(this._domNode, DefineKeybindingWidget.HEIGHT);

		this._domNode.style.display = 'none';
		this._isVisible = false;

		this._messageNode = document.createElement('div');
		this._messageNode.className = 'message';
		this._messageNode.innerText = NLS_DEFINE_MESSAGE;
		this._domNode.appendChild(this._messageNode);

		this._inputNode = document.createElement('input');
		this._inputNode.className = 'input';
		this._inputNode.type = 'text';
		this._domNode.appendChild(this._inputNode);

		this._outputNode = document.createElement('div');
		this._outputNode.className = 'output';
		this._domNode.appendChild(this._outputNode);

		this._toDispose.push(dom.addDisposableListener(this._inputNode, 'keydown', (e) => {
			let keyEvent = new StandardKeyboardEvent(e);
			keyEvent.preventDefault();
			keyEvent.stopPropagation();

			let kb = keyEvent.toKeybinding();
			switch (kb.value) {
				case KeyCode.Enter:
					if (this._lastKeybinding) {
						this._onAccepted(KeybindingLabels.toUserSettingsLabel(this._lastKeybinding.value));
					}
					this._stop();
					return;

				case KeyCode.Escape:
					this._stop();
					return;
			}

			this._lastKeybinding = kb;

			this._inputNode.value = KeybindingLabels.toUserSettingsLabel(this._lastKeybinding.value).toLowerCase();
			this._inputNode.title = 'keyCode: ' + keyEvent.browserEvent.keyCode;

			dom.clearNode(this._outputNode);
			let htmlkb = this._keybindingService.getHTMLLabelFor(this._lastKeybinding);
			htmlkb.forEach((item) => this._outputNode.appendChild(renderHtml(item)));
		}));
		this._toDispose.push(this._editor.onDidChangeConfiguration((e) => {
			if (this._isVisible) {
				this._layout();
			}
		}));

		this._toDispose.push(dom.addDisposableListener(this._inputNode, 'blur', (e) => this._stop()));

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = dispose(this._toDispose);
	}

	public getId(): string {
		return DefineKeybindingWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	private _show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._layout();
		this._domNode.style.display = 'block';
	}

	private _hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._domNode.style.display = 'none';
	}

	private _layout(): void {
		let editorLayout = this._editor.getLayoutInfo();

		let top = Math.round((editorLayout.height - DefineKeybindingWidget.HEIGHT) / 2);
		StyleMutator.setTop(this._domNode, top);

		let left = Math.round((editorLayout.width - DefineKeybindingWidget.WIDTH) / 2);
		StyleMutator.setLeft(this._domNode, left);
	}

	public start(): void {
		this._editor.revealPositionInCenterIfOutsideViewport(this._editor.getPosition());

		this._show();

		this._lastKeybinding = null;
		this._inputNode.value = '';
		dom.clearNode(this._outputNode);
		this._inputNode.focus();
	}

	private _stop(): void {
		this._editor.focus();
		this._hide();
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
