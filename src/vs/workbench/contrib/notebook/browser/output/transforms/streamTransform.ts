/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOutputTransformContribution, IRenderOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { registerOutputTransform } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import { NotebookHandler } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

class StreamRenderer implements IOutputTransformContribution {
	constructor(
		handler: NotebookHandler
	) {
	}

	render(output: any, container: HTMLElement): IRenderOutput {
		const contentNode = document.createElement('p');
		contentNode.innerText = output.text;
		container.appendChild(contentNode);
		return {
			hasDynamicHeight: false
		};

	}

	dispose(): void {
	}
}

registerOutputTransform('notebook.output.stream', ['stream'], StreamRenderer);
