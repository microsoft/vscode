/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CellOutputKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { BrandedService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { INotebookEditor, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookEditorWidget } from 'vs/workbench/contrib/notebook/browser/notebookEditorWidget';
import { URI } from 'vs/base/common/uri';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

export type IOutputTransformCtor = IConstructorSignature1<INotebookEditor, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	id: string;
	kind: CellOutputKind;
	ctor: IOutputTransformCtor;
}

function EditorTabId(uri: URI, group: IEditorGroup) {
	return `${uri.toString()}@${group.id}`;
}

export const NotebookRegistry = new class NotebookRegistryImpl {

	readonly outputTransforms: IOutputTransformDescription[] = [];
	readonly notebookEditorWidgetOwnership = new Map<string, NotebookEditorWidget>();

	registerOutputTransform<Services extends BrandedService[]>(id: string, kind: CellOutputKind, ctor: { new(editor: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
		this.outputTransforms.push({ id: id, kind: kind, ctor: ctor as IOutputTransformCtor });
	}

	getOutputTransformContributions(): IOutputTransformDescription[] {
		return this.outputTransforms.slice(0);
	}

	claimNotebookEditorWidget(notebook: URI, group: IEditorGroup, widget: NotebookEditorWidget) {
		this.notebookEditorWidgetOwnership.set(EditorTabId(notebook, group), widget);
	}

	releaseNotebookEditorWidget(notebook: URI, group: IEditorGroup) {
		this.notebookEditorWidgetOwnership.delete(EditorTabId(notebook, group));
	}

	getNotebookEditorWidget(notebook: URI, group: IEditorGroup) {
		return this.notebookEditorWidgetOwnership.get(EditorTabId(notebook, group));
	}
};
