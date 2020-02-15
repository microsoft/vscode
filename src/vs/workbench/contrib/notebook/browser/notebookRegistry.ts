/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOutputTransformContribution } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { BrandedService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export type IOutputTransformCtor = IConstructorSignature1<INotebookEditor, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	id: string;
	types: string[];
	ctor: IOutputTransformCtor;
}

export namespace NotebookRegistry {
	export function getOutputTransformContributions(): IOutputTransformDescription[] {
		return NotebookRegistryImpl.INSTANCE.getNotebookOutputTransform();
	}
}

export function registerOutputTransform<Services extends BrandedService[]>(id: string, types: string[], ctor: { new(handler: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
	NotebookRegistryImpl.INSTANCE.registerOutputTransform(id, types, ctor);
}

class NotebookRegistryImpl {

	public static readonly INSTANCE = new NotebookRegistryImpl();

	private readonly outputTransforms: IOutputTransformDescription[];

	constructor() {
		this.outputTransforms = [];
	}

	public registerOutputTransform<Services extends BrandedService[]>(id: string, types: string[], ctor: { new(handler: INotebookEditor, ...services: Services): IOutputTransformContribution }): void {
		this.outputTransforms.push({ id: id, types: types, ctor: ctor as IOutputTransformCtor });
	}

	public getNotebookOutputTransform(): IOutputTransformDescription[] {
		return this.outputTransforms.slice(0);
	}
}
