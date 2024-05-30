/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReferenceCollection, type IReference } from 'vs/base/common/lifecycle';
import { IInstantiationService, createDecorator } from 'vs/platform/instantiation/common/instantiation';
import type { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellOutlineProvider } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProvider';
import type { OutlineTarget } from 'vs/workbench/services/outline/browser/outline';

class NotebookCellOutlineProviderReferenceCollection extends ReferenceCollection<NotebookCellOutlineProvider> {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}
	protected override createReferencedObject(_key: string, editor: INotebookEditor, target: OutlineTarget): NotebookCellOutlineProvider {
		return this.instantiationService.createInstance(NotebookCellOutlineProvider, editor, target);
	}
	protected override destroyReferencedObject(_key: string, object: NotebookCellOutlineProvider): void {
		object.dispose();
	}
}

export const INotebookCellOutlineProviderFactory = createDecorator<INotebookCellOutlineProviderFactory>('INotebookCellOutlineProviderFactory');

export interface INotebookCellOutlineProviderFactory {
	getOrCreate(editor: INotebookEditor, target: OutlineTarget): IReference<NotebookCellOutlineProvider>;
}

export class NotebookCellOutlineProviderFactory implements INotebookCellOutlineProviderFactory {
	private readonly _data: NotebookCellOutlineProviderReferenceCollection;
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this._data = instantiationService.createInstance(NotebookCellOutlineProviderReferenceCollection);
	}

	getOrCreate(editor: INotebookEditor, target: OutlineTarget): IReference<NotebookCellOutlineProvider> {
		return this._data.acquire(editor.getId(), editor, target);
	}
}
