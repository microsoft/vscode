/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {EventType, ICommonCodeEditor} from 'vs/editor/common/editorCommon';

export enum Behaviour {
	TextFocus = 1 << 0,
	WidgetFocus = 1 << 1,
	Writeable = 1 << 2,
	UpdateOnModelChange = 1 << 3,
	UpdateOnConfigurationChange = 1 << 4,
	ShowInContextMenu = 1 << 5,
	UpdateOnCursorPositionChange = 1 << 6
}

export interface IEditorAction {
	isSupported(): boolean;
	getEnablementState(): boolean;
}

export function createActionEnablement(editor: ICommonCodeEditor, condition:Behaviour, action:IEditorAction): IEnablementState {
	return new CompositeEnablementState([new InternalEnablementState(condition, editor), new DescentEnablementState(condition, editor, action)]);
}

/**
 * Used to signal that something enabled
 */
export interface IEnablementState extends IDisposable {
	value(): boolean;
	reset(): void;
}

/**
 * A composite that acts like a logical AND on
 * enablement states
 */
class CompositeEnablementState implements IEnablementState {

	constructor(private _delegates:IEnablementState[]) {
		// empty
	}

	public value():boolean {
		return this._delegates.every(d => d.value());
	}

	public reset():void {
		this._delegates.forEach(d => {
			if(d instanceof CachingEnablementState) {
				(<CachingEnablementState> d).reset();
			}
		});
	}

	public dispose():void {
		this._delegates.forEach(d => d.dispose());
	}
}

/**
 * A enablement state that caches its result until
 * reset is called.
 */
class CachingEnablementState implements IEnablementState {

	private _value:boolean;

	constructor() {
		this._value = null;
	}

	public reset():void {
		this._value = null;
	}

	public dispose():void {
		//
	}

	public value():boolean {
		if (this._value === null) {
			this._value = this._computeValue();
		}
		return this._value;
	}

	public _computeValue():boolean {
		return false;
	}
}

/**
 * An enablement state that checks behaviours of the
 * editor action that can be check inside the action,
 * for instance: widget focus, text focus, readonly-ness
 */
class InternalEnablementState extends CachingEnablementState {

	public hasTextFocus:boolean;
	public hasWidgetFocus:boolean;
	public isReadOnly:boolean;

	private _callOnDispose:IDisposable[];

	constructor(private _behaviour:Behaviour, private editor:ICommonCodeEditor) {
		super();

		this.hasTextFocus = false;
		this.hasWidgetFocus = false;
		this.isReadOnly = false;

		this._callOnDispose = [];
		if (this._behaviour & Behaviour.TextFocus) {
			this._callOnDispose.push(this.editor.addListener2(EventType.EditorTextFocus, () => this._updateTextFocus(true)));
			this._callOnDispose.push(this.editor.addListener2(EventType.EditorTextBlur, () => this._updateTextFocus(false)));
		}
		if (this._behaviour & Behaviour.WidgetFocus) {
			this._callOnDispose.push(this.editor.addListener2(EventType.EditorFocus, () => this._updateWidgetFocus(true)));
			this._callOnDispose.push(this.editor.addListener2(EventType.EditorBlur, () => this._updateWidgetFocus(false)));
		}
		if (this._behaviour & Behaviour.Writeable) {
			this._callOnDispose.push(this.editor.addListener2(EventType.ConfigurationChanged, (e) => this._update()));
		}
	}

	private _updateTextFocus(hasTextFocus:boolean):void {
		this.hasTextFocus = hasTextFocus;
		this.reset();
	}

	private _updateWidgetFocus(hasWidgetFocus:boolean):void {
		this.hasWidgetFocus = hasWidgetFocus;
		this.reset();
	}

	private _update():void {
		this.isReadOnly = this.editor.getConfiguration().readOnly;
		this.reset();
	}

	public dispose():void {
		super.dispose();
		disposeAll(this._callOnDispose);
	}

	public _computeValue():boolean {
		if(this._behaviour & Behaviour.TextFocus && !this.hasTextFocus) {
			return false;
		}
		if(this._behaviour & Behaviour.WidgetFocus && !this.hasWidgetFocus) {
			return false;
		}
		if(this._behaviour & Behaviour.Writeable && this.isReadOnly) {
			return false;
		}
		return true;
	}
}

/**
 * An enablement state that makes uses of the
 * {{isSupported}} and {{getEnablementState}}
 * functions that are supposed to be overwritten.
 */
class DescentEnablementState extends CachingEnablementState {

	private _callOnDispose:Function[] = [];

	constructor(behaviour:Behaviour, private editor:ICommonCodeEditor, private _action:IEditorAction) {
		super();

		if (behaviour & Behaviour.UpdateOnModelChange) {
			this._callOnDispose.push(this.editor.addListener(EventType.ModelChanged, () => this.reset()));
			this._callOnDispose.push(this.editor.addListener(EventType.ModelModeChanged, () => this.reset()));
			this._callOnDispose.push(this.editor.addListener(EventType.ModelModeSupportChanged, () => this.reset()));
		}
		if (behaviour & Behaviour.UpdateOnCursorPositionChange) {
			this._callOnDispose.push(this.editor.addListener(EventType.CursorPositionChanged, () => this.reset()));
		}
	}

	public _computeValue():boolean {
		if(!this.editor.getModel()) {
			return false;
		}
		if(!this._action.isSupported()) {
			return false;
		}
		if(!this._action.getEnablementState()) {
			return false;
		}
		return true;
	}
}

