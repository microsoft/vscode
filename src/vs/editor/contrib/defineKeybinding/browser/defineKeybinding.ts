/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./defineKeybinding';
import nls = require('vs/nls');
import {EditorBrowserRegistry} from 'vs/editor/browser/editorBrowserExtensions';
import DomUtils = require('vs/base/browser/dom');
import EditorBrowser = require('vs/editor/browser/editorBrowser');
import EditorCommon = require('vs/editor/common/editorCommon');
import {disposeAll, IDisposable} from 'vs/base/common/lifecycle';
import {INullService} from 'vs/platform/instantiation/common/instantiation';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {KeyMod, KeyCode, CommonKeybindings, Keybinding} from 'vs/base/common/keyCodes';
import Snippet = require('vs/editor/contrib/snippet/common/snippet');
import {EditorAction, Behaviour} from 'vs/editor/common/editorAction';
import {CommonEditorRegistry, ContextKey, EditorActionDescriptor} from 'vs/editor/common/editorCommonExtensions';
import {TPromise} from 'vs/base/common/winjs.base';
import {IKeybindingService} from 'vs/platform/keybinding/common/keybindingService';
import {RunOnceScheduler} from 'vs/base/common/async';
import {IOSupport} from 'vs/platform/keybinding/common/commonKeybindingResolver';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';

const NLS_LAUNCH_MESSAGE = nls.localize('defineKeybinding.start', "Define Keybinding");
const NLS_DEFINE_MESSAGE = nls.localize('defineKeybinding.initial', "Press desired key combination and ENTER");
const NLS_DEFINE_ACTION_LABEL = nls.localize('DefineKeybindingAction',"Define Keybinding");
const NLS_KB_LAYOUT_INFO_MESSAGE = nls.localize('defineKeybinding.kbLayoutMessage', "For your current keyboard layout press ");

const INTERESTING_FILE = /keybindings\.json$/;

export class DefineKeybindingController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.defineKeybinding';

	static get(editor:EditorCommon.ICommonCodeEditor): DefineKeybindingController {
		return <DefineKeybindingController>editor.getContribution(DefineKeybindingController.ID);
	}

	private _editor: EditorBrowser.ICodeEditor;
	private _keybindingService:IKeybindingService;
	private _launchWidget: DefineKeybindingLauncherWidget;
	private _defineWidget: DefineKeybindingWidget;
	private _toDispose: IDisposable[];
	private _modelToDispose: IDisposable[];
	private _updateDecorations: RunOnceScheduler;

	constructor(
		editor:EditorBrowser.ICodeEditor,
		@IKeybindingService keybindingService:IKeybindingService
	) {
		this._editor = editor;
		this._keybindingService = keybindingService;
		this._toDispose = [];
		this._launchWidget = new DefineKeybindingLauncherWidget(this._editor, keybindingService, () => this.launch());
		this._defineWidget = new DefineKeybindingWidget(this._editor, (keybinding) => this._onAccepted(keybinding));

		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelChanged, (e) => {
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
		this._modelToDispose = disposeAll(this._modelToDispose);
		this._toDispose = disposeAll(this._toDispose);
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

	private _onAccepted(keybinding:string): void {
		let snippetText = [
			'{',
			'\t"key": "' + keybinding + '",',
			'\t"command": "{{commandId}}",',
			'\t"when": "{{editorTextFocus}}"',
			'}{{}}'
		].join('\n');

		Snippet.get(this._editor).run(new Snippet.CodeSnippet(snippetText), 0, 0);
	}

	private _onModel(): void {
		this._modelToDispose = disposeAll(this._modelToDispose);

		let model = this._editor.getModel();
		if (!model) {
			return;
		}

		let url = model.getAssociatedResource().toString();
		if (!INTERESTING_FILE.test(url)) {
			return;
		}

		this._modelToDispose.push(model.addListener2(EditorCommon.EventType.ModelContentChanged2, (e) => this._updateDecorations.schedule()));
		this._modelToDispose.push({
			dispose: () => {
				this._dec = this._editor.deltaDecorations(this._dec, []);
				this._updateDecorations.cancel();
			}
		});
		this._updateDecorations.schedule();
	}

	private static _cachedKeybindingRegex: string = null;
	private static _getKeybindingRegex(): string {
		if (!this._cachedKeybindingRegex) {
			let numpadKey = "numpad(0|1|2|3|4|5|6|7|8|9|_multiply|_add|_subtract|_decimal|_divide)";
			let punctKey = "`|\\-|=|\\[|\\]|\\\\\\\\|;|'|,|\\.|\\/";
			let specialKey = "left|up|right|down|pageup|pagedown|end|home|tab|enter|escape|space|backspace|delete|pausebreak|capslock|insert";
			let casualKey = "[a-z]|[0-9]|f(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15)";
			let key = '((' + [numpadKey, punctKey, specialKey, casualKey].join(')|(') + '))';
			let mod = '((ctrl|shift|alt|cmd|win|meta)\\+)*';
			let keybinding = '(' + mod + key + ')';

			this._cachedKeybindingRegex = '"\\s*(' + keybinding + '(\\s+' + keybinding +')?' + ')\\s*"';
		}
		return this._cachedKeybindingRegex;
	}

	private _dec:string[] = [];
	private _updateDecorationsNow(): void {
		let model = this._editor.getModel();
		let regex = DefineKeybindingController._getKeybindingRegex();

		var m = model.findMatches(regex, false, true, false, false);

		let data = m.map((range) => {
			let text = model.getValueInRange(range);

			let strKeybinding = text.substring(1, text.length - 1);
			strKeybinding = strKeybinding.replace(/\\\\/g, '\\');

			let numKeybinding = IOSupport.readKeybinding(strKeybinding);

			let keybinding = new Keybinding(numKeybinding);

			return {
				strKeybinding: strKeybinding,
				keybinding: keybinding,
				usLabel: keybinding._toUSLabel(),
				label: this._keybindingService.getLabelFor(keybinding),
				range: range
			};
		});

		data = data.filter((entry) => {
			return (entry.usLabel !== entry.label);
		});

		this._dec = this._editor.deltaDecorations(this._dec, data.map((m) : EditorCommon.IModelDeltaDecoration => {
			let label = m.label;
			let msg:IHTMLContentElement[] = [{
				tagName: 'span',
				text: NLS_KB_LAYOUT_INFO_MESSAGE
			}];
			msg = msg.concat(this._keybindingService.getHTMLLabelFor(m.keybinding));
			return {
				range: m.range,
				options: {
					stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: 'keybindingInfo',
					htmlMessage: msg,
					inlineClassName: 'inlineKeybindingInfo',
					overviewRuler: {
						color: 'rgba(100, 100, 250, 0.6)',
						darkColor: 'rgba(100, 100, 250, 0.6)',
						position: EditorCommon.OverviewRulerLane.Right
					}
				}
			}
		}))
	}
}

class DefineKeybindingLauncherWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingLauncherWidget';

	private _editor: EditorBrowser.ICodeEditor;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];

	constructor(editor:EditorBrowser.ICodeEditor, keybindingService:IKeybindingService, onLaunch:()=>void) {
		this._editor = editor;
		this._domNode = document.createElement('div');
		this._domNode.className = 'defineKeybindingLauncher';
		this._domNode.style.display = 'none';
		let keybinding = keybindingService.lookupKeybindings(DefineKeybindingAction.ID);
		let extra = '';
		if (keybinding.length > 0) {
			extra += ' ('+keybindingService.getLabelFor(keybinding[0])+')';
		}
		this._domNode.appendChild(document.createTextNode(NLS_LAUNCH_MESSAGE + extra));

		this._toDispose = [];
		this._toDispose.push(DomUtils.addDisposableListener(this._domNode, 'click', (e) => {
			onLaunch();
		}))

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = disposeAll(this._toDispose);
	}

	public show(): void {
		this._domNode.style.display = 'block';
	}

	public hide(): void {
		this._domNode.style.display = 'none';
	}

	// ----- IOverlayWidget API

	public getId(): string {
		return DefineKeybindingLauncherWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return {
			preference: EditorBrowser.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

class DefineKeybindingWidget implements EditorBrowser.IContentWidget {

	private static ID = 'editor.contrib.defineKeybindingWidget';

	private _editor: EditorBrowser.ICodeEditor;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];
	private _position: EditorCommon.IPosition;

	private _messageNode: HTMLElement;
	private _inputNode: HTMLInputElement;

	private _lastKeybinding: Keybinding;
	private _onAccepted: (keybinding:string) => void;

	constructor(editor:EditorBrowser.ICodeEditor, onAccepted:(keybinding:string) => void) {
		this._editor = editor;
		this._onAccepted = onAccepted;
		this._toDispose = [];
		this._position = null;
		this._lastKeybinding = null;

		this._domNode = document.createElement('div');
		this._domNode.className = 'defineKeybindingWidget';

		this._messageNode = document.createElement('div');
		this._messageNode.className = 'message';
		this._messageNode.innerText = NLS_DEFINE_MESSAGE;
		this._domNode.appendChild(this._messageNode);

		this._inputNode = document.createElement('input');
		this._inputNode.className = 'input';
		this._domNode.appendChild(this._inputNode);

		this._toDispose.push(DomUtils.addDisposableListener(this._inputNode, 'keydown', (e) => {
			let keyEvent = new StandardKeyboardEvent(e);
			keyEvent.preventDefault();
			keyEvent.stopPropagation();

			let kb = new Keybinding(keyEvent.asKeybinding());
			switch (kb.value) {
				case CommonKeybindings.ENTER:
					if (this._lastKeybinding) {
						this._onAccepted(this._lastKeybinding.toUserSettingsLabel());
					}
					this._stop();
					return;

				case CommonKeybindings.ESCAPE:
					this._stop();
					return;
			}

			this._lastKeybinding = kb;

			this._inputNode.value = this._lastKeybinding.toUserSettingsLabel().toLowerCase();
			this._inputNode.title = 'keyCode: ' + keyEvent.browserEvent.keyCode;
		}));

		this._toDispose.push(DomUtils.addDisposableListener(this._inputNode, 'blur', (e) => this._stop()));

		this._editor.addContentWidget(this);
	}

	public dispose(): void {
		this._editor.removeContentWidget(this);
		this._toDispose = disposeAll(this._toDispose);
	}

	public getId(): string {
		return DefineKeybindingWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IContentWidgetPosition {
		if (!this._position) {
			return null;
		}
		return {
			position: this._position,
			preference: [EditorBrowser.ContentWidgetPositionPreference.BELOW]
		};
	}

	public start(): void {
		this._position = this._editor.getPosition();
		this._editor.revealPositionInCenterIfOutsideViewport(this._position);
		this._editor.layoutContentWidget(this);

		// Force a view render
		this._editor.getOffsetForColumn(this._position.lineNumber, this._position.column);

		this._lastKeybinding = null;
		this._inputNode.value = '';
		this._inputNode.focus();
	}

	private _stop(): void {
		this._editor.focus();
		this._position = null;
		this._editor.layoutContentWidget(this);
	}
}

export class DefineKeybindingAction extends EditorAction {

	static ID = 'editor.action.defineKeybinding';

	constructor(descriptor:EditorCommon.IEditorActionDescriptorData, editor:EditorCommon.ICommonCodeEditor, @INullService ns) {
		super(descriptor, editor, Behaviour.WidgetFocus | Behaviour.UpdateOnModelChange | Behaviour.Writeable);
	}

	public isSupported(): boolean {
		if (!super.isSupported()) {
			return false;
		}
		return isInterestingEditorModel(this.editor);
	}

	public run(): TPromise<boolean> {
		var controller = DefineKeybindingController.get(this.editor);
		controller.launch();
		return TPromise.as(true);
	}

}

function isInterestingEditorModel(editor:EditorCommon.ICommonCodeEditor): boolean {
	if (editor.getConfiguration().readOnly) {
		return false;
	}
	let model = editor.getModel();
	if (!model) {
		return false;
	}
	let url = model.getAssociatedResource().toString();
	return INTERESTING_FILE.test(url);
}

EditorBrowserRegistry.registerEditorContribution(DefineKeybindingController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DefineKeybindingAction, DefineKeybindingAction.ID, NLS_DEFINE_ACTION_LABEL, {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)
}));