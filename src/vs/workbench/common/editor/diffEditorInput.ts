/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {TPromise} from 'vs/base/common/winjs.base';
import types = require('vs/base/common/types');
import URI from 'vs/base/common/uri';
import {getPathLabel, IWorkspaceProvider} from 'vs/base/common/labels';
import {isBinaryMime} from 'vs/base/common/mime';
import {EventType} from 'vs/base/common/events';
import {EditorModel, IFileEditorInput, EditorInput, BaseDiffEditorInput} from 'vs/workbench/common/editor';
import {BaseTextEditorModel} from 'vs/workbench/common/editor/textEditorModel';
import {DiffEditorModel} from 'vs/workbench/common/editor/diffEditorModel';
import {TextDiffEditorModel} from 'vs/workbench/common/editor/textDiffEditorModel';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';

/**
 * The base editor input for the diff editor. It is made up of two editor inputs, the original version
 * and the modified version.
 */
export class DiffEditorInput extends BaseDiffEditorInput {

	public static ID = 'workbench.editors.diffEditorInput';

	private _toUnbind: IDisposable[];
	private name: string;
	private description: string;
	private cachedModel: DiffEditorModel;
	private forceOpenAsBinary: boolean;

	constructor(name: string, description: string, originalInput: EditorInput, modifiedInput: EditorInput, forceOpenAsBinary?: boolean) {
		super(originalInput, modifiedInput);

		this.name = name;
		this.description = description;
		this.forceOpenAsBinary = forceOpenAsBinary;

		this._toUnbind = [];

		this.registerListeners();
	}

	private registerListeners(): void {

		// When the original or modified input gets disposed, dispose this diff editor input
		this._toUnbind.push(this.originalInput.addListener2(EventType.DISPOSE, () => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		this._toUnbind.push(this.modifiedInput.addListener2(EventType.DISPOSE, () => {
			if (!this.isDisposed()) {
				this.dispose();
			}
		}));

		// When the modified model gets dirty, re-emit this to the outside
		this._toUnbind.push(this.modifiedInput.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
	}

	public get toUnbind() {
		return this._toUnbind;
	}

	public getTypeId(): string {
		return DiffEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public getDescription(): string {
		return this.description;
	}

	public setOriginalInput(input: EditorInput): void {
		this.originalInput = input;
	}

	public setModifiedInput(input: EditorInput): void {
		this.modifiedInput = input;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {
		let modelPromise: TPromise<EditorModel>;

		// Use Cached Model
		if (this.cachedModel && !refresh) {
			modelPromise = TPromise.as<EditorModel>(this.cachedModel);
		}

		// Create Model - we never reuse our cached model if refresh is true because we cannot
		// decide for the inputs within if the cached model can be reused or not. There may be
		// inputs that need to be loaded again and thus we always recreate the model and dispose
		// the previous one - if any.
		else {
			modelPromise = this.createModel(refresh);
		}

		return modelPromise.then((resolvedModel: DiffEditorModel) => {
			if (this.cachedModel) {
				this.cachedModel.dispose();
			}

			this.cachedModel = resolvedModel;

			return this.cachedModel;
		});
	}

	public getPreferredEditorId(candidates: string[]): string {

		// Find the right diff editor for the given isBinary/isText state
		let useBinaryEditor = this.forceOpenAsBinary || this.isBinary(this.originalInput) || this.isBinary(this.modifiedInput);

		return !useBinaryEditor ? 'workbench.editors.textDiffEditor' : 'workbench.editors.binaryResourceDiffEditor';
	}

	private isBinary(input: EditorInput): boolean {
		let mime: string;

		// Find mime by checking for IFileEditorInput implementors
		let fileInput = <IFileEditorInput>(<any>input);
		if (types.isFunction(fileInput.getMime)) {
			mime = fileInput.getMime();
		}

		return mime && isBinaryMime(mime);
	}

	private createModel(refresh?: boolean): TPromise<DiffEditorModel> {

		// Join resolve call over two inputs and build diff editor model
		return TPromise.join<EditorModel>([
			this.originalInput.resolve(refresh),
			this.modifiedInput.resolve(refresh)
		]).then((models) => {
			let originalEditorModel = models[0];
			let modifiedEditorModel = models[1];

			// If both are text models, return textdiffeditor model
			if (modifiedEditorModel instanceof BaseTextEditorModel && originalEditorModel instanceof BaseTextEditorModel) {
				return new TextDiffEditorModel(<BaseTextEditorModel>originalEditorModel, <BaseTextEditorModel>modifiedEditorModel);
			}

			// Otherwise return normal diff model
			return new DiffEditorModel(originalEditorModel, modifiedEditorModel);
		});
	}

	public supportsSplitEditor(): boolean {
		return false;
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput) {
			if (!(otherInput instanceof DiffEditorInput)) {
				return false;
			}

			let otherDiffInput = <DiffEditorInput>otherInput;
			return this.originalInput.matches(otherDiffInput.originalInput) && this.modifiedInput.matches(otherDiffInput.modifiedInput);
		}

		return false;
	}

	public dispose(): void {
		this._toUnbind = dispose(this._toUnbind);

		// Dispose Model
		if (this.cachedModel) {
			this.cachedModel.dispose();
			this.cachedModel = null;
		}

		super.dispose();
	}
}

export function toDiffLabel(res1: URI, res2: URI, context: IWorkspaceProvider): string {
	let leftName = getPathLabel(res1.fsPath, context);
	let rightName = getPathLabel(res2.fsPath, context);

	return nls.localize('compareLabels', "{0} ↔ {1}", leftName, rightName);
}