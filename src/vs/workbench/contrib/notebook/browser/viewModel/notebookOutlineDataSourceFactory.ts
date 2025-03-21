/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ReferenceCollection, type IReference } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService, createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { INotebookEditor } from '../notebookBrowser.js';
import { NotebookCellOutlineDataSource } from './notebookOutlineDataSource.js';

class NotebookCellOutlineDataSourceReferenceCollection extends ReferenceCollection<NotebookCellOutlineDataSource> {
	constructor(@IInstantiationService private readonly instantiationService: IInstantiationService) {
		super();
	}
	protected override createReferencedObject(_key: string, editor: INotebookEditor): NotebookCellOutlineDataSource {
		return this.instantiationService.createInstance(NotebookCellOutlineDataSource, editor);
	}
	protected override destroyReferencedObject(_key: string, object: NotebookCellOutlineDataSource): void {
		object.dispose();
	}
}

export const INotebookCellOutlineDataSourceFactory = createDecorator<INotebookCellOutlineDataSourceFactory>('INotebookCellOutlineDataSourceFactory');

export interface INotebookCellOutlineDataSourceFactory {
	getOrCreate(editor: INotebookEditor): IReference<NotebookCellOutlineDataSource>;
}

export class NotebookCellOutlineDataSourceFactory implements INotebookCellOutlineDataSourceFactory {
	private readonly _data: NotebookCellOutlineDataSourceReferenceCollection;
	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		this._data = instantiationService.createInstance(NotebookCellOutlineDataSourceReferenceCollection);
	}

	getOrCreate(editor: INotebookEditor): IReference<NotebookCellOutlineDataSource> {
		return this._data.acquire(editor.getId(), editor);
	}
}
