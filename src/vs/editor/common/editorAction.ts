/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Action} from 'vs/base/common/actions';
import * as strings from 'vs/base/common/strings';
import {TPromise} from 'vs/base/common/winjs.base';
import {Behaviour, IEnablementState, createActionEnablement} from 'vs/editor/common/editorActionEnablement';
import {IActionDescriptor, IActionEnablement, ICommonCodeEditor, IEditorActionDescriptorData, IEditorContribution} from 'vs/editor/common/editorCommon';
import {ILineContext} from 'vs/editor/common/modes';

var defaultBehaviour = Behaviour.TextFocus | Behaviour.Writeable | Behaviour.UpdateOnModelChange;

export class EditorAction extends Action implements IEditorContribution {

	public editor:ICommonCodeEditor;

	private _shouldShowInContextMenu:boolean;
	private _supportsReadonly:boolean;
	private _descriptor:IEditorActionDescriptorData;
	private _enablementState:IEnablementState;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, condition:Behaviour = defaultBehaviour) {
		super(descriptor.id);
		this.editor = editor;
		this._descriptor = descriptor;
		this.label = descriptor.label || '';
		this._enablementState = createActionEnablement(editor, condition, this);

		this._shouldShowInContextMenu = !!(condition & Behaviour.ShowInContextMenu);

		this._supportsReadonly = !(condition & Behaviour.Writeable);
	}

	public getId(): string {
		return this.id;
	}

	public dispose(): void {
		this._enablementState.dispose();
		super.dispose();
	}

	/**
	 * A helper to be able to group and sort actions when they are presented visually.
	 */
	public getGroupId(): string {
		return this.id;
	}

	public shouldShowInContextMenu(): boolean {
		return this._shouldShowInContextMenu;
	}

	public getDescriptor(): IEditorActionDescriptorData {
		return this._descriptor;
	}

	// ---- enablement state mangament --------------------------------------------------------

	public get enabled():boolean {
		return this._enablementState.value();
	}

	public set enabled(value:boolean) {
		// call reset?
		var e:any = new Error();
		console.log('setting EditorAction.enabled is UNCOOL. Use resetEnablementState and getEnablementState');
		console.log(e.stack);
	}

	public resetEnablementState():void {
		this._enablementState.reset();
	}

	/**
	 * Returns {{true}} in case this action works
	 * with the current mode. To be overwritten
	 * in subclasses.
	 */
	public isSupported():boolean {
		if (!this._supportsReadonly) {
			if (this.editor.getConfiguration().readOnly) {
				return false; // action requires a writeable model
			}

			var model = this.editor.getModel();
			if (model && model.hasEditableRange()) {
				return false; // editable ranges are an indicator for mostly readonly models
			}
		}

		return true;
	}

	/**
	 * Returns the enablement state of this action. This
	 * method is being called in the process of {{updateEnablementState}}
	 * and overwriters should call super (this method).
	 */
	public getEnablementState(): boolean {
		return true;
	}
}

export class HandlerEditorAction extends EditorAction {
	private _handlerId: string;

	constructor(descriptor:IEditorActionDescriptorData, editor:ICommonCodeEditor, handlerId: string) {
		super(descriptor, editor);
		this._handlerId = handlerId;
	}

	public run(): TPromise<boolean> {
		this.editor.trigger(this.getId(), this._handlerId, null);
		return TPromise.as(true);
	}
}

export class DynamicEditorAction extends EditorAction {

	private static _transformBehaviour(behaviour:IActionEnablement, contextMenuGroupId: string): Behaviour {
		var r = 0;
		if (contextMenuGroupId) {
			r |= Behaviour.ShowInContextMenu;
		} else if (behaviour.textFocus) {
			// Allowed to set text focus only if not appearing in the context menu
			r |= Behaviour.TextFocus;
		}
		if (behaviour.widgetFocus) {
			r |= Behaviour.WidgetFocus;
		}
		if (behaviour.writeableEditor) {
			r |= Behaviour.Writeable;
		}

		if (typeof behaviour.tokensAtPosition !== 'undefined') {
			r |= Behaviour.UpdateOnCursorPositionChange;
		}
		if (typeof behaviour.wordAtPosition !== 'undefined') {
			r |= Behaviour.UpdateOnCursorPositionChange;
		}
		return r;
	}

	private _contextMenuGroupId: string;
	private _run: (editor:ICommonCodeEditor)=>void;
	private _tokensAtPosition:string[];
	private _wordAtPosition:boolean;

	constructor(descriptor:IActionDescriptor, editor:ICommonCodeEditor) {
		var enablement: IActionEnablement = descriptor.enablement || {};
		super({
			id: descriptor.id,
			label: descriptor.label
		}, editor, DynamicEditorAction._transformBehaviour(enablement, descriptor.contextMenuGroupId));

		this._contextMenuGroupId = descriptor.contextMenuGroupId;
		this._run = descriptor.run;

		this._tokensAtPosition = enablement.tokensAtPosition;
		this._wordAtPosition = enablement.wordAtPosition;
	}

	public getGroupId(): string {
		return this._contextMenuGroupId;
	}

	public run(): TPromise<void> {
		return TPromise.as(this._run(this.editor));
	}

	public getEnablementState():boolean {
		return this._getEnablementOnTokens() && this._getEnablementOnWord();
	}

	private _getEnablementOnTokens(): boolean {
		if (!this._tokensAtPosition) {
			return true;
		}

		var model = this.editor.getModel(),
			position = this.editor.getSelection().getStartPosition(),
			lineContext = model.getLineContext(position.lineNumber),
			offset = position.column - 1;

		return isToken(lineContext, offset, this._tokensAtPosition);
	}

	private _getEnablementOnWord(): boolean {
		if (!this._wordAtPosition) {
			return true;
		}

		var model = this.editor.getModel(),
			position = this.editor.getSelection().getStartPosition(),
			wordAtPosition = model.getWordAtPosition(position);

		return (!!wordAtPosition);
	}
}

function isToken(context:ILineContext, offset:number, types:string[]): boolean {

	if (context.getLineContent().length <= offset) {
		return false;
	}

	var tokenIdx = context.findIndexOfOffset(offset);
	var type = context.getTokenType(tokenIdx);

	for (var i = 0, len = types.length; i < len; i++) {
		if (types[i] === '') {
			if (type === '') {
				return true;
			}
		} else {
			if (strings.startsWith(type, types[i])) {
				return true;
			}
		}
	}

	return false;
}