/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { onUnexpectedError } from 'vs/base/common/errors';
import { ICellOutputViewModel, ICommonNotebookEditor, IOutputTransformContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';

export class OutputRenderer extends Disposable {

	private readonly _richMimeTypeRenderers = new Map<string, IOutputTransformContribution>();

	constructor(
		notebookEditor: ICommonNotebookEditor,
		private readonly instantiationService: IInstantiationService
	) {
		super();
		for (const desc of OutputRendererRegistry.getOutputTransformContributions()) {
			try {
				const contribution = this.instantiationService.createInstance(desc.ctor, notebookEditor);
				contribution.getMimetypes().forEach(mimetype => {
					this._richMimeTypeRenderers.set(mimetype, contribution);
				});
				this._register(contribution);
			} catch (err) {
				onUnexpectedError(err);
			}
		}
	}

	override dispose(): void {
		super.dispose();
		this._richMimeTypeRenderers.clear();
	}

	getContribution(preferredMimeType: string | undefined): IOutputTransformContribution | undefined {
		if (preferredMimeType) {
			return this._richMimeTypeRenderers.get(preferredMimeType);
		}

		return undefined;
	}

	private _renderNoop(viewModel: ICellOutputViewModel, container: HTMLElement): IRenderOutput {
		const contentNode = document.createElement('p');
		contentNode.innerText = localize('empty', "No renderer could be found for output.");
		container.appendChild(contentNode);
		return { type: RenderOutputType.Mainframe };
	}

	render(viewModel: ICellOutputViewModel, container: HTMLElement, preferredMimeType: string | undefined, notebookUri: URI): IRenderOutput {
		if (!viewModel.model.outputs.length) {
			return this._renderNoop(viewModel, container);
		}

		if (!preferredMimeType || !this._richMimeTypeRenderers.has(preferredMimeType)) {
			const contentNode = document.createElement('p');
			const mimeTypes = viewModel.model.outputs.map(op => op.mime);

			const mimeTypesMessage = mimeTypes.join(', ');

			if (preferredMimeType) {
				contentNode.innerText = localize('noRenderer.1', "No renderer could be found for MIME type: {0}", preferredMimeType);
			} else {
				contentNode.innerText = localize('noRenderer.2', "No renderer could be found for output. It has the following MIME types: {0}", mimeTypesMessage);
			}

			container.appendChild(contentNode);
			return { type: RenderOutputType.Mainframe };
		}

		const renderer = this._richMimeTypeRenderers.get(preferredMimeType);
		const items = viewModel.model.outputs.filter(op => op.mime === preferredMimeType);

		if (items.length && renderer) {
			return renderer.render(viewModel, items, container, notebookUri);
		} else {
			return this._renderNoop(viewModel, container);
		}
	}
}
