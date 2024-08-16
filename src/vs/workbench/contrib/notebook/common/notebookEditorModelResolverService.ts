/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';
import { IResolvedNotebookEditorModel, NotebookEditorModelCreationOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IReference } from 'vs/base/common/lifecycle';
import { Event, IWaitUntil } from 'vs/base/common/event';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';

export const INotebookEditorModelResolverService = createDecorator<INotebookEditorModelResolverService>('INotebookModelResolverService');

/**
 * A notebook file can only be opened ONCE per notebook type.
 * This event fires when a file is already open as type A
 * and there is request to open it as type B. Listeners must
 * do cleanup (close editor, release references) or the request fails
 */
export interface INotebookConflictEvent extends IWaitUntil {
	resource: URI;
	viewType: string;
}

export interface IUntitledNotebookResource {
	/**
	 * Depending on the value of `untitledResource` will
	 * resolve a untitled notebook that:
	 * - gets a unique name if `undefined` (e.g. `Untitled-1')
	 * - uses the resource directly if the scheme is `untitled:`
	 * - converts any other resource scheme to `untitled:` and will
	 *   assume an associated file path
	 *
	 * Untitled notebook editors with associated path behave slightly
	 * different from other untitled editors:
	 * - they are dirty right when opening
	 * - they will not ask for a file path when saving but use the associated path
	 */
	untitledResource: URI | undefined;
}

export interface INotebookEditorModelResolverService {
	readonly _serviceBrand: undefined;

	readonly onDidSaveNotebook: Event<URI>;
	readonly onDidChangeDirty: Event<IResolvedNotebookEditorModel>;

	readonly onWillFailWithConflict: Event<INotebookConflictEvent>;

	isDirty(resource: URI): boolean;

	createUntitledNotebookTextModel(viewType: string): Promise<NotebookTextModel>;

	resolve(resource: URI, viewType?: string, creationOptions?: NotebookEditorModelCreationOptions): Promise<IReference<IResolvedNotebookEditorModel>>;
	resolve(resource: IUntitledNotebookResource, viewType: string, creationOtions?: NotebookEditorModelCreationOptions): Promise<IReference<IResolvedNotebookEditorModel>>;
}
