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

export class DefineKeybindingController implements EditorCommon.IEditorContribution {

	static ID = 'editor.contrib.defineKeybinding';

	static get(editor:EditorCommon.ICommonCodeEditor): DefineKeybindingController {
		return <DefineKeybindingController>editor.getContribution(DefineKeybindingController.ID);
	}

	private _editor: EditorBrowser.ICodeEditor;
	private _launchWidget: DefineKeybindingLauncherWidget;
	private _defineWidget: DefineKeybindingWidget;
	private _toDispose: IDisposable[];

	constructor(
		editor:EditorBrowser.ICodeEditor,
		@IKeybindingService keybindingService:IKeybindingService
	) {
		this._editor = editor;
		this._toDispose = [];
		this._launchWidget = new DefineKeybindingLauncherWidget(this._editor, keybindingService, () => this.launch());
		this._defineWidget = new DefineKeybindingWidget(this._editor, (keybinding) => this._onAccepted(keybinding));

		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.ModelChanged, (e) => {
			if (isInterestingEditorModel(this._editor)) {
				this._launchWidget.show();
			} else {
				this._launchWidget.hide();
			}
		}));
	}

	public getId(): string {
		return DefineKeybindingController.ID;
	}

	public dispose(): void {
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
			extra += ' ('+keybinding[0].toLabel()+')';
		}
		this._domNode.appendChild(document.createTextNode(nls.localize('defineKeybinding.start', "Define Keybinding" + extra)));

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
	private _outputNode: HTMLElement;

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
		this._messageNode.innerText = nls.localize('defineKeybinding.initial', "Press desired key combination and ENTER");
		this._domNode.appendChild(this._messageNode);

		this._inputNode = document.createElement('input');
		this._inputNode.className = 'input';
		this._domNode.appendChild(this._inputNode);

		this._outputNode = document.createElement('div');
		this._outputNode.className = 'output';
		this._domNode.appendChild(this._outputNode);

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

			this._outputNode.innerText = this._lastKeybinding.toUserSettingsLabel().toLowerCase();
			this._outputNode.title = 'keyCode: ' + keyEvent.browserEvent.keyCode;
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
		this._outputNode.innerText = '';
		this._outputNode.title = '';
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

const INTERESTING_FILE = /keybindings\.json$/;
function isInterestingEditorModel(editor:EditorCommon.ICommonCodeEditor): boolean {
	let model = editor.getModel();
	if (!model) {
		return false;
	}
	let url = model.getAssociatedResource().toString();
	return INTERESTING_FILE.test(url);
}

EditorBrowserRegistry.registerEditorContribution(DefineKeybindingController);
CommonEditorRegistry.registerEditorAction(new EditorActionDescriptor(DefineKeybindingAction, DefineKeybindingAction.ID, nls.localize('DefineKeybindingAction',"Define Keybinding"), {
	context: ContextKey.EditorFocus,
	primary: KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.KEY_K)
}));