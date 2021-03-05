/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { ICommonNotebookEditor, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export type IOutputTransformCtor = IConstructorSignature1<ICommonNotebookEditor, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	id: string;
	ctor: IOutputTransformCtor;
}


export const NotebookRegistry = new class NotebookRegistryImpl {

	readonly outputTransforms: IOutputTransformDescription[] = [];

	registerOutputTransform<Services extends BrandedService[]>(id: string, ctor: { new(editor: ICommonNotebookEditor, ...services: Services): IOutputTransformContribution }): void {
		this.outputTransforms.push({ id: id, ctor: ctor as IOutputTransformCtor });
	}

	getOutputTransformContributions(): IOutputTransformDescription[] {
		return this.outputTransforms.slice(0);
	}
};
