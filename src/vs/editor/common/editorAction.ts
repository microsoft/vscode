/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IActionDescriptor, ICommonCodeEditor, IEditorAction} from 'vs/editor/common/editorCommon';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {EditorAction} from 'vs/editor/common/editorCommonExtensions';

export abstract class AbstractInternalEditorAction {

	public id: string;
	public label: string;
	public alias: string;
	protected _editor: ICommonCodeEditor;

	constructor(id:string, label:string, alias:string, editor:ICommonCodeEditor) {
		this.id = id;
		this.label = label;
		this.alias = alias;
		this._editor = editor;
	}
}

export class InternalEditorAction extends AbstractInternalEditorAction implements IEditorAction {

	private _actual: EditorAction;
	private _instantiationService:IInstantiationService;

	constructor(actual:EditorAction, editor:ICommonCodeEditor, instantiationService:IInstantiationService) {
		super(actual.id, actual.label, actual.alias, editor);
		this._actual = actual;
		this._instantiationService = instantiationService;
	}

	public get enabled():boolean {
		return this._instantiationService.invokeFunction((accessor) => {
			return this._actual.enabled(accessor, this._editor);
		});
	}

	public isSupported():boolean {
		return this._instantiationService.invokeFunction((accessor) => {
			return this._actual.supported(accessor, this._editor);
		});
	}

	public run(): TPromise<void> {
		return this._instantiationService.invokeFunction((accessor) => {
			return TPromise.as(this._actual.run(accessor, this._editor));
		});
	}
}

export class DynamicEditorAction extends AbstractInternalEditorAction implements IEditorAction {

	private _run: (editor:ICommonCodeEditor)=>void;

	constructor(descriptor:IActionDescriptor, editor:ICommonCodeEditor) {
		super(descriptor.id, descriptor.label, descriptor.label, editor);

		this._run = descriptor.run;
	}

	public get enabled():boolean {
		return true;
	}

	public isSupported():boolean {
		return true;
	}

	public run(): TPromise<void> {
		return TPromise.as(this._run(this._editor));
	}
}
