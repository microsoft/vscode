/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { CellOutputKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookRegistry } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import { ICommonNotebookEditor, IOutputTransformContribution, IRenderOutput, IStreamOutputViewModel, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { truncatedArrayOfString } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/textHelper';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IThemeService } from 'vs/platform/theme/common/themeService';

class StreamRenderer implements IOutputTransformContribution {
	constructor(
		editor: ICommonNotebookEditor,
		@IOpenerService readonly openerService: IOpenerService,
		@ITextFileService readonly textFileService: ITextFileService,
		@IThemeService readonly themeService: IThemeService
	) {
	}

	render(viewModel: IStreamOutputViewModel, container: HTMLElement): IRenderOutput {
		const output = viewModel.model;
		const contentNode = DOM.$('.output-stream');
		truncatedArrayOfString(contentNode, [output.text], this.openerService, this.textFileService, this.themeService, false);
		container.appendChild(contentNode);
		return { type: RenderOutputType.None, hasDynamicHeight: false };
	}

	dispose(): void {
	}
}

NotebookRegistry.registerOutputTransform('notebook.output.stream', CellOutputKind.Text, StreamRenderer);
