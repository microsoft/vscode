/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Mimes } from 'vs/base/common/mime';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { ICellOutputViewModel, IOutputTransformContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookDelegateForOutput } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { truncatedArrayOfString } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/textHelper';
import { IOutputItemDto, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';


class StreamRendererContrib extends Disposable implements IOutputTransformContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return ['application/vnd.code.notebook.stdout', 'application/x.notebook.stdout', 'application/x.notebook.stream'];
	}

	constructor(
		public notebookEditor: INotebookDelegateForOutput,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const disposables = new DisposableStore();
		const linkDetector = this.instantiationService.createInstance(LinkDetector);

		const text = getStringValue(item);
		const contentNode = DOM.$('span.output-stream');
		const lineLimit = this.configurationService.getValue<number>(NotebookSetting.textOutputLineLimit) ?? 30;
		truncatedArrayOfString(notebookUri, output.cellViewModel, output.model.outputId, Math.max(lineLimit, 6), contentNode, [text], disposables, linkDetector, this.openerService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.Mainframe, disposable: disposables };
	}
}

class StderrRendererContrib extends StreamRendererContrib {
	override getType() {
		return RenderOutputType.Mainframe;
	}

	override getMimetypes() {
		return ['application/vnd.code.notebook.stderr', 'application/x.notebook.stderr'];
	}

	override render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const result = super.render(output, item, container, notebookUri);
		container.classList.add('error');
		return result;
	}
}

class PlainTextRendererContrib extends Disposable implements IOutputTransformContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	getMimetypes() {
		return [Mimes.text];
	}

	constructor(
		public notebookEditor: INotebookDelegateForOutput,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const disposables = new DisposableStore();
		const linkDetector = this.instantiationService.createInstance(LinkDetector);

		const str = getStringValue(item);
		const contentNode = DOM.$('.output-plaintext');
		const lineLimit = this.configurationService.getValue<number>(NotebookSetting.textOutputLineLimit) ?? 30;
		truncatedArrayOfString(notebookUri, output.cellViewModel, output.model.outputId, Math.max(lineLimit, 6), contentNode, [str], disposables, linkDetector, this.openerService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.Mainframe, supportAppend: true, disposable: disposables };
	}
}

OutputRendererRegistry.registerOutputTransform(PlainTextRendererContrib);
OutputRendererRegistry.registerOutputTransform(StreamRendererContrib);
OutputRendererRegistry.registerOutputTransform(StderrRendererContrib);


// --- utils ---
export function getStringValue(item: IOutputItemDto): string {
	return item.data.toString();
}
