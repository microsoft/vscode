/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CellOutputKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { BrandedService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { INotebookEditor, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorInput } from 'vs/workbench/contrib/notebook/browser/notebookEditorInput';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';

export type IOutputTransformCtor = IConstructorSignature1<INotebookEditor, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	id: string;
	kind: CellOutputKind;
	ctor: IOutputTransformCtor;
}

export namespace NotebookRegistry {
	export function getOutputTransformContributions(): IOutputTransformDescription[] {
		return NotebookRegistryImpl.INSTANCE.getNotebookOutputTransform();
	}

	export function claimNotebookEditorWidget(editorInput: NotebookEditorInput, widget: NotebookEditorWidget) {
		NotebookRegistryImpl.INSTANCE.claimNotebookEditorWidget(editorInput, widget);
	}

	export function releaseNotebookEditorWidget(editorInput: NotebookEditorInput) {
		NotebookRegistryImpl.INSTANCE.releaseNotebookEditorWidget(editorInput);
	}

	export function getNotebookEditorWidget(editorInput: NotebookEditorInput): NotebookEditorWidget | undefined {
		return NotebookRegistryImpl.INSTANCE.getNotebookEditorWidget(editorInput);
	}
}

export function registerOutputTransform<Services extends BrandedService[]>(id: string, kind: CellOutputKind, ctor: { new(editor: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
	NotebookRegistryImpl.INSTANCE.registerOutputTransform(id, kind, ctor);
}

class NotebookRegistryImpl {

	static readonly INSTANCE = new NotebookRegistryImpl();

	private readonly outputTransforms: IOutputTransformDescription[];
	private readonly notebookEditorWidgetOwnership = new Map<NotebookEditorInput, NotebookEditorWidget>();

	constructor() {
		this.outputTransforms = [];
	}

	registerOutputTransform<Services extends BrandedService[]>(id: string, kind: CellOutputKind, ctor: { new(editor: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
		this.outputTransforms.push({ id: id, kind: kind, ctor: ctor as IOutputTransformCtor });
	}

	getNotebookOutputTransform(): IOutputTransformDescription[] {
		return this.outputTransforms.slice(0);
	}

	claimNotebookEditorWidget(editorInput: NotebookEditorInput, widget: NotebookEditorWidget) {
		this.notebookEditorWidgetOwnership.set(editorInput, widget);
	}

	releaseNotebookEditorWidget(editorInput: NotebookEditorInput) {
		this.notebookEditorWidgetOwnership.delete(editorInput);
	}

	getNotebookEditorWidget(editorInput: NotebookEditorInput) {
		return this.notebookEditorWidgetOwnership.get(editorInput);
	}
}
