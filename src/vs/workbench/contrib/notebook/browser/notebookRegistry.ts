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
import { ResourceMap } from 'vs/base/common/map';

export type IOutputTransformCtor = IConstructorSignature1<INotebookEditor, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	id: string;
	kind: CellOutputKind;
	ctor: IOutputTransformCtor;
}


export const NotebookRegistry = new class NotebookRegistryImpl {

	readonly outputTransforms: IOutputTransformDescription[] = [];
	readonly notebookEditorWidgetOwnership = new ResourceMap<Map<number, NotebookEditorWidget>>();

	registerOutputTransform<Services extends BrandedService[]>(id: string, kind: CellOutputKind, ctor: { new(editor: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
		this.outputTransforms.push({ id: id, kind: kind, ctor: ctor as IOutputTransformCtor });
	}

	getOutputTransformContributions(): IOutputTransformDescription[] {
		return this.outputTransforms.slice(0);
	}

	claimNotebookEditorWidget(notebook: URI, group: IEditorGroup, widget: NotebookEditorWidget) {
		let map = this.notebookEditorWidgetOwnership.get(notebook);
		if (!map) {
			map = new Map();
			this.notebookEditorWidgetOwnership.set(notebook, map);
		}
		map.set(group.id, widget);
	}

	releaseNotebookEditorWidget(notebook: URI, group: IEditorGroup) {
		const map = this.notebookEditorWidgetOwnership.get(notebook);
		if (!map) {
			return;
		}
		map.delete(group.id);
		if (map.size === 0) {
			this.notebookEditorWidgetOwnership.delete(notebook);
		}
	}

	getNotebookEditorWidget(notebook: URI, group: IEditorGroup) {
		return this.notebookEditorWidgetOwnership.get(notebook)?.get(group.id);
	}

	releaseAllNotebookEditorWidgets(notebook: URI) {
		let values = [...this.notebookEditorWidgetOwnership.get(notebook)?.values() ?? []];
		this.notebookEditorWidgetOwnership.delete(notebook);
		return values;
	}
};
