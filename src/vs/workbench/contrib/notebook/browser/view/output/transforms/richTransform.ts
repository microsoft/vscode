/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookRegistry } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import * as DOM from 'vs/base/browser/dom';
import { ICellOutputViewModel, ICommonNotebookEditor, IOutputTransformContribution as IOutputRendererContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { isArray } from 'vs/base/common/types';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { URI } from 'vs/base/common/uri';
import { MarkdownRenderer } from 'vs/editor/browser/core/markdownRenderer';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { dirname } from 'vs/base/common/resources';
import { truncatedArrayOfString } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/textHelper';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ErrorTransform } from 'vs/workbench/contrib/notebook/browser/view/output/transforms/errorTransform';
import { Disposable } from 'vs/base/common/lifecycle';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';

function getStringValue(data: unknown): string {
	return isArray(data) ? data.join('') : String(data);
}

class JSONRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['application/json'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const str = items.map(item => JSON.stringify(item.value, null, '\t')).join('');

		const editor = this.instantiationService.createInstance(CodeEditorWidget, container, {
			...getOutputSimpleEditorOptions(),
			dimension: {
				width: 0,
				height: 0
			}
		}, {
			isSimpleWidget: true
		});

		const mode = this.modeService.create('json');
		const resource = URI.parse(`notebook-output-${Date.now()}.json`);
		const textModel = this.modelService.createModel(str, mode, resource, false);
		editor.setModel(textModel);

		const width = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).width;
		const fontInfo = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).fontInfo;
		const height = Math.min(textModel.getLineCount(), 16) * (fontInfo.lineHeight || 18);

		editor.layout({
			height,
			width
		});

		container.style.height = `${height + 8}px`;

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: true };
	}
}

class JavaScriptRendererContrib extends Disposable implements IOutputRendererContribution {
	getMimetypes() {
		return ['application/javascript'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		let scriptVal = '';
		items.forEach(item => {
			const data = item.value;
			const str = isArray(data) ? data.join('') : data;
			scriptVal += `<script type="application/javascript">${str}</script>`;

		});
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: scriptVal,
			hasDynamicHeight: false
		};
	}
}

class CodeRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['text/x-javascript'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const str = items.map(item => getStringValue(item.value)).join('');
		const editor = this.instantiationService.createInstance(CodeEditorWidget, container, {
			...getOutputSimpleEditorOptions(),
			dimension: {
				width: 0,
				height: 0
			}
		}, {
			isSimpleWidget: true
		});

		const mode = this.modeService.create('javascript');
		const resource = URI.parse(`notebook-output-${Date.now()}.js`);
		const textModel = this.modelService.createModel(str, mode, resource, false);
		editor.setModel(textModel);

		const width = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).width;
		const fontInfo = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).fontInfo;
		const height = Math.min(textModel.getLineCount(), 16) * (fontInfo.lineHeight || 18);

		editor.layout({
			height,
			width
		});

		container.style.height = `${height + 8}px`;

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: true };
	}
}

class StreamRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['application/x.notebook.stream'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		items.forEach(item => {
			const text = getStringValue(item.value);
			const contentNode = DOM.$('span.output-stream');
			truncatedArrayOfString(contentNode, [text], this.openerService, this.textFileService, this.themeService);
			container.appendChild(contentNode);
		});

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: false };
	}
}

class ErrorRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['application/x.notebook.error-traceback'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		items.forEach(item => {
			const data = item.value;

			ErrorTransform.render(data, container, this.themeService);
		});

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: false };
	}
}

class PlainTextRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['text/plain'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IOpenerService private readonly openerService: IOpenerService,
		@IThemeService private readonly themeService: IThemeService,
		@ITextFileService private readonly textFileService: ITextFileService
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const str = items.map(item => getStringValue(item.value));
		const contentNode = DOM.$('.output-plaintext');
		truncatedArrayOfString(contentNode, str, this.openerService, this.textFileService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: false, supportAppend: true };
	}
}

class HTMLRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['text/html'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = items.map(item => getStringValue(item.value)).join('');

		const str = (isArray(data) ? data.join('') : data) as string;
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: str,
			hasDynamicHeight: false
		};
	}
}

class SVGRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['image/svg+xml'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const str = items.map(item => getStringValue(item.value)).join('');
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: str,
			hasDynamicHeight: false
		};
	}
}

class MdRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['text/markdown'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI): IRenderOutput {
		items.forEach(item => {
			const data = item.value;
			const str = (isArray(data) ? data.join('') : data) as string;
			const mdOutput = document.createElement('div');
			const mdRenderer = this.instantiationService.createInstance(MarkdownRenderer, { baseUrl: dirname(notebookUri) });
			mdOutput.appendChild(mdRenderer.render({ value: str, isTrusted: true, supportThemeIcons: true }, undefined, { gfm: true }).element);
			container.appendChild(mdOutput);
		});

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: true };
	}
}

class PNGRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['image/png'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		items.forEach(item => {
			const image = document.createElement('img');
			const imagedata = item.value;
			image.src = `data:image/png;base64,${imagedata}`;
			const display = document.createElement('div');
			display.classList.add('display');
			display.appendChild(image);
			container.appendChild(display);
		});
		return { type: RenderOutputType.Mainframe, hasDynamicHeight: true };
	}
}

class JPEGRendererContrib extends Disposable implements IOutputRendererContribution {

	getMimetypes() {
		return ['image/jpeg'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, items: IOutputItemDto[], container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		items.forEach(item => {
			const image = document.createElement('img');
			const imagedata = item.value;
			image.src = `data:image/jpeg;base64,${imagedata}`;
			const display = document.createElement('div');
			display.classList.add('display');
			display.appendChild(image);
			container.appendChild(display);
		});

		return { type: RenderOutputType.Mainframe, hasDynamicHeight: true };
	}
}

NotebookRegistry.registerOutputTransform('json', JSONRendererContrib);
NotebookRegistry.registerOutputTransform('javascript', JavaScriptRendererContrib);
NotebookRegistry.registerOutputTransform('html', HTMLRendererContrib);
NotebookRegistry.registerOutputTransform('svg', SVGRendererContrib);
NotebookRegistry.registerOutputTransform('markdown', MdRendererContrib);
NotebookRegistry.registerOutputTransform('png', PNGRendererContrib);
NotebookRegistry.registerOutputTransform('jpeg', JPEGRendererContrib);
NotebookRegistry.registerOutputTransform('plain', PlainTextRendererContrib);
NotebookRegistry.registerOutputTransform('code', CodeRendererContrib);
NotebookRegistry.registerOutputTransform('error-trace', ErrorRendererContrib);
NotebookRegistry.registerOutputTransform('stream-text', StreamRendererContrib);

export function getOutputSimpleEditorOptions(): IEditorOptions {
	return {
		readOnly: true,
		wordWrap: 'on',
		overviewRulerLanes: 0,
		glyphMargin: false,
		selectOnLineNumbers: false,
		hideCursorInOverviewRuler: true,
		selectionHighlight: false,
		lineDecorationsWidth: 0,
		overviewRulerBorder: false,
		scrollBeyondLastLine: false,
		renderLineHighlight: 'none',
		minimap: {
			enabled: false
		},
		lineNumbers: 'off',
		scrollbar: {
			alwaysConsumeMouseWheel: false
		}
	};
}
