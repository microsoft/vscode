/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor, IEditorAction } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

export abstract class AbstractInternalEditorAction {

	public id: string;
	public label: string;
	public alias: string;
	protected _editor: ICommonCodeEditor;

	constructor(id: string, label: string, alias: string, editor: ICommonCodeEditor) {
		this.id = id;
		this.label = label;
		this.alias = alias;
		this._editor = editor;
	}
}

export class InternalEditorAction extends AbstractInternalEditorAction implements IEditorAction {

	private _actual: EditorAction;
	private _instantiationService: IInstantiationService;
	private _contextKeyService: IContextKeyService;

	constructor(
		actual: EditorAction,
		editor: ICommonCodeEditor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(actual.id, actual.label, actual.alias, editor);
		this._actual = actual;
		this._instantiationService = instantiationService;
		this._contextKeyService = contextKeyService;
	}

	public isSupported(): boolean {
		return this._contextKeyService.contextMatchesRules(this._actual.precondition);
	}

	public run(): TPromise<void> {
		if (!this.isSupported()) {
			return TPromise.as(void 0);
		}

		return this._instantiationService.invokeFunction((accessor) => {
			return TPromise.as(this._actual.runEditorCommand(accessor, this._editor, null));
		});
	}
}

export class DynamicEditorAction extends AbstractInternalEditorAction implements IEditorAction {

	private _run: (editor: ICommonCodeEditor) => void;

	constructor(id: string, label: string, run: (editor: ICommonCodeEditor) => void | TPromise<void>, editor: ICommonCodeEditor) {
		super(id, label, label, editor);

		this._run = run;
	}

	public isSupported(): boolean {
		return true;
	}

	public run(): TPromise<void> {
		return TPromise.as(this._run(this._editor));
	}
}
