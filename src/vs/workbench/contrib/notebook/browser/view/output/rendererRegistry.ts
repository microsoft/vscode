/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrandedService, IConstructorSignature1 } from 'vs/platform/instantiation/common/instantiation';
import { ICommonNotebookEditorDelegate, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export type IOutputTransformCtor = IConstructorSignature1<ICommonNotebookEditorDelegate, IOutputTransformContribution>;

export interface IOutputTransformDescription {
	ctor: IOutputTransformCtor;
}

export const OutputRendererRegistry = new class NotebookRegistryImpl {

	readonly #outputTransforms: IOutputTransformDescription[] = [];

	registerOutputTransform<Services extends BrandedService[]>(ctor: { new(editor: ICommonNotebookEditorDelegate, ...services: Services): IOutputTransformContribution }): void {
		this.#outputTransforms.push({ ctor: ctor as IOutputTransformCtor });
	}

	getOutputTransformContributions(): IOutputTransformDescription[] {
		return this.#outputTransforms.slice(0);
	}
};
