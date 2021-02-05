/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NotebookRegistry } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ICellOutputViewModel, ICommonNotebookEditor, IOutputTransformContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { URI } from 'vs/base/common/uri';

export class OutputRenderer {
	protected readonly _contributions: { [key: string]: IOutputTransformContribution; };
	protected readonly _renderers: IOutputTransformContribution[];

	constructor(
		notebookEditor: ICommonNotebookEditor,
		private readonly instantiationService: IInstantiationService
	) {
		this._contributions = {};
		this._renderers = [];

		const contributions = NotebookRegistry.getOutputTransformContributions();

		for (const desc of contributions) {
			try {
				const contribution = this.instantiationService.createInstance(desc.ctor, notebookEditor);
				this._contributions[desc.id] = contribution;
				this._renderers.push(contribution);
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}

	renderNoop(viewModel: ICellOutputViewModel, container: HTMLElement): IRenderOutput {
		const contentNode = document.createElement('p');

		contentNode.innerText = `No renderer could be found for output.`;
		container.appendChild(contentNode);
		return { type: RenderOutputType.None, hasDynamicHeight: false };
	}

	render(viewModel: ICellOutputViewModel, container: HTMLElement, preferredMimeType: string | undefined, notebookUri: URI | undefined): IRenderOutput {
		const transform = this._renderers[0];

		if (transform) {
			return transform.render(viewModel, container, preferredMimeType, notebookUri);
		} else {
			return this.renderNoop(viewModel, container);
		}
	}
}
