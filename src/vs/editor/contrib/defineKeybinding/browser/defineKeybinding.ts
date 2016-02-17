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
import {IOSupport} from 'vs/platform/keybinding/common/keybindingResolver';
import {IHTMLContentElement} from 'vs/base/common/htmlContent';
import {renderHtml} from 'vs/base/browser/htmlContentRenderer';
import {Range} from 'vs/editor/common/core/range';
import {StyleMutator} from 'vs/base/browser/styleMutator';

const NLS_LAUNCH_MESSAGE = nls.localize('defineKeybinding.start', "Define Keybinding");
const NLS_DEFINE_MESSAGE = nls.localize('defineKeybinding.initial', "Press desired key combination and ENTER");
const NLS_DEFINE_ACTION_LABEL = nls.localize('DefineKeybindingAction',"Define Keybinding");
const NLS_KB_LAYOUT_INFO_MESSAGE = nls.localize('defineKeybinding.kbLayoutInfoMessage', "For your current keyboard layout press ");
const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize('defineKeybinding.kbLayoutErrorMessage', "You won't be able to produce this key combination under your current keyboard layout.");

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
		this._defineWidget = new DefineKeybindingWidget(this._editor, keybindingService, (keybinding) => this._onAccepted(keybinding));

		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.ConfigurationChanged, (e) => {
			if (isInterestingEditorModel(this._editor)) {
				this._launchWidget.show();
			} else {
				this._launchWidget.hide();
			}
		}));
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

	private _dec:string[] = [];
	private _updateDecorationsNow(): void {
		let model = this._editor.getModel();
		let regex = Keybinding.getUserSettingsKeybindingRegex();

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

		let newDecorations: EditorCommon.IModelDeltaDecoration[] = [];
		data.forEach((item) => {
			let msg:IHTMLContentElement[];
			let className: string;
			let inlineClassName: string;
			let overviewRulerColor: string;

			if (!item.label) {
				// this is the error case
				msg = [{
					tagName: 'span',
					text: NLS_KB_LAYOUT_ERROR_MESSAGE
				}];
				className = 'keybindingError';
				inlineClassName = 'inlineKeybindingError';
				overviewRulerColor = 'rgba(250, 100, 100, 0.6)';
			} else {
				// this is the info case
				msg = [{
					tagName: 'span',
					text: NLS_KB_LAYOUT_INFO_MESSAGE
				}];
				msg = msg.concat(this._keybindingService.getHTMLLabelFor(item.keybinding));
				className = 'keybindingInfo';
				inlineClassName = 'inlineKeybindingInfo';
				overviewRulerColor = 'rgba(100, 100, 250, 0.6)';
			}

			// icon decoration
			newDecorations.push({
				range: new Range(item.range.startLineNumber, item.range.startColumn, item.range.startLineNumber, item.range.startColumn + 1),
				options: {
					stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					inlineClassName: inlineClassName
				}
			});

			// highlight + message decoration
			newDecorations.push({
				range: item.range,
				options: {
					stickiness: EditorCommon.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
					className: className,
					htmlMessage: msg,
					overviewRuler: {
						color: overviewRulerColor,
						darkColor: overviewRulerColor,
						position: EditorCommon.OverviewRulerLane.Right
					}
				}
			});
		});

		this._dec = this._editor.deltaDecorations(this._dec, newDecorations);
	}
}

class DefineKeybindingLauncherWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingLauncherWidget';

	private _editor: EditorBrowser.ICodeEditor;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];
	private _isVisible: boolean;

	constructor(editor:EditorBrowser.ICodeEditor, keybindingService:IKeybindingService, onLaunch:()=>void) {
		this._editor = editor;
		this._domNode = document.createElement('div');
		this._domNode.className = 'defineKeybindingLauncher';
		this._domNode.style.display = 'none';
		this._isVisible = false;
		let keybinding = keybindingService.lookupKeybindings(DefineKeybindingAction.ID);
		let extra = '';
		if (keybinding.length > 0) {
			extra += ' ('+keybindingService.getLabelFor(keybinding[0])+')';
		}
		this._domNode.appendChild(document.createTextNode(NLS_LAUNCH_MESSAGE + extra));

		this._toDispose = [];
		this._toDispose.push(DomUtils.addDisposableListener(this._domNode, 'click', (e) => {
			onLaunch();
		}));

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = disposeAll(this._toDispose);
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

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
		return {
			preference: this._isVisible ? EditorBrowser.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER : null
		};
	}
}


class DefineKeybindingWidget implements EditorBrowser.IOverlayWidget {

	private static ID = 'editor.contrib.defineKeybindingWidget';
	private static WIDTH = 340;
	private static HEIGHT = 90;

	private _editor: EditorBrowser.ICodeEditor;
	private _keybindingService:IKeybindingService;

	private _domNode: HTMLElement;
	private _toDispose: IDisposable[];

	private _messageNode: HTMLElement;
	private _inputNode: HTMLInputElement;
	private _outputNode: HTMLElement;

	private _lastKeybinding: Keybinding;
	private _onAccepted: (keybinding:string) => void;
	private _isVisible: boolean;

	constructor(editor:EditorBrowser.ICodeEditor, keybindingService:IKeybindingService, onAccepted:(keybinding:string) => void) {
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

			DomUtils.clearNode(this._outputNode);
			let htmlkb = this._keybindingService.getHTMLLabelFor(this._lastKeybinding);
			htmlkb.forEach((item) => this._outputNode.appendChild(renderHtml(item)));
		}));
		this._toDispose.push(this._editor.addListener2(EditorCommon.EventType.ConfigurationChanged, (e) => {
			if (this._isVisible) {
				this._layout();
			}
		}));

		this._toDispose.push(DomUtils.addDisposableListener(this._inputNode, 'blur', (e) => this._stop()));

		this._editor.addOverlayWidget(this);
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		this._toDispose = disposeAll(this._toDispose);
	}

	public getId(): string {
		return DefineKeybindingWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): EditorBrowser.IOverlayWidgetPosition {
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
		DomUtils.clearNode(this._outputNode);
		this._inputNode.focus();
	}

	private _stop(): void {
		this._editor.focus();
		this._hide();
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