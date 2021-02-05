/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookRegistry } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import * as DOM from 'vs/base/browser/dom';
import { ICellOutputViewModel, ICommonNotebookEditor, IOutputTransformContribution, IRenderOutput, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
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

class JSONRenderer extends Disposable implements IOutputTransformContribution {

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

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['application/json'];
		const str = JSON.stringify(data, null, '\t');

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

		container.style.height = `${height + 16}px`;

		return { type: RenderOutputType.None, hasDynamicHeight: true };
	}
}

class JavaScriptRenderer extends Disposable implements IOutputTransformContribution {
	getMimetypes() {
		return ['application/javascript'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['application/javascript'];
		const str = isArray(data) ? data.join('') : data;
		const scriptVal = `<script type="application/javascript">${str}</script>`;
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: scriptVal,
			hasDynamicHeight: false
		};
	}
}

class CodeRenderer extends Disposable implements IOutputTransformContribution {

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

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['text/x-javascript'];
		const str = (isArray(data) ? data.join('') : data) as string;

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

		container.style.height = `${height + 16}px`;

		return { type: RenderOutputType.None, hasDynamicHeight: true };
	}
}

class StreamRenderer extends Disposable implements IOutputTransformContribution {

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

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['application/x.notebook.stream'] as any;
		const text = (isArray(data) ? data.join('') : data) as string;
		const contentNode = DOM.$('span.output-stream');
		truncatedArrayOfString(contentNode, [text], this.openerService, this.textFileService, this.themeService);
		container.appendChild(contentNode);
		return { type: RenderOutputType.None, hasDynamicHeight: false };
	}
}

class ErrorRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['application/x.notebook.error-traceback'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IThemeService private readonly themeService: IThemeService
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['application/x.notebook.error-traceback'] as any;
		ErrorTransform.render(data, container, this.themeService);
		return { type: RenderOutputType.None, hasDynamicHeight: false };
	}
}

class PlainTextRenderer extends Disposable implements IOutputTransformContribution {

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

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['text/plain'];
		const contentNode = DOM.$('.output-plaintext');
		truncatedArrayOfString(contentNode, isArray(data) ? data : [data], this.openerService, this.textFileService, this.themeService);
		container.appendChild(contentNode);

		return { type: RenderOutputType.None, hasDynamicHeight: false };
	}
}

class HTMLRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['text/html'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['text/html'];
		const str = (isArray(data) ? data.join('') : data) as string;
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: str,
			hasDynamicHeight: false
		};
	}
}

class SVGRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['image/svg+xml'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const data = output.model.data['image/svg+xml'];
		const str = (isArray(data) ? data.join('') : data) as string;
		return {
			type: RenderOutputType.Html,
			source: output,
			htmlContent: str,
			hasDynamicHeight: false
		};
	}
}

class MdRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['text/markdown'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI): IRenderOutput {
		const data = output.model.data['text/markdown'];
		const str = (isArray(data) ? data.join('') : data) as string;
		const mdOutput = document.createElement('div');
		const mdRenderer = this.instantiationService.createInstance(MarkdownRenderer, { baseUrl: dirname(notebookUri) });
		mdOutput.appendChild(mdRenderer.render({ value: str, isTrusted: true, supportThemeIcons: true }, undefined, { gfm: true }).element);
		container.appendChild(mdOutput);

		return { type: RenderOutputType.None, hasDynamicHeight: true };
	}
}

class PNGRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['image/png'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const image = document.createElement('img');
		image.src = `data:image/png;base64,${output.model.data['image/png']}`;
		const display = document.createElement('div');
		display.classList.add('display');
		display.appendChild(image);
		container.appendChild(display);
		return { type: RenderOutputType.None, hasDynamicHeight: true };
	}
}

class JPEGRenderer extends Disposable implements IOutputTransformContribution {

	getMimetypes() {
		return ['image/jpeg'];
	}

	constructor(
		public notebookEditor: ICommonNotebookEditor,
	) {
		super();
	}

	render(output: ICellOutputViewModel, container: HTMLElement, notebookUri: URI | undefined): IRenderOutput {
		const image = document.createElement('img');
		image.src = `data:image/jpeg;base64,${output.model.data['image/jpeg']}`;
		const display = document.createElement('div');
		display.classList.add('display');
		display.appendChild(image);
		container.appendChild(display);
		return { type: RenderOutputType.None, hasDynamicHeight: true };
	}
}

NotebookRegistry.registerOutputTransform('json', JSONRenderer);
NotebookRegistry.registerOutputTransform('javascript', JavaScriptRenderer);
NotebookRegistry.registerOutputTransform('html', HTMLRenderer);
NotebookRegistry.registerOutputTransform('svg', SVGRenderer);
NotebookRegistry.registerOutputTransform('markdown', MdRenderer);
NotebookRegistry.registerOutputTransform('png', PNGRenderer);
NotebookRegistry.registerOutputTransform('jpeg', JPEGRenderer);
NotebookRegistry.registerOutputTransform('plain', PlainTextRenderer);
NotebookRegistry.registerOutputTransform('code', CodeRenderer);
NotebookRegistry.registerOutputTransform('error-trace', ErrorRenderer);
NotebookRegistry.registerOutputTransform('stream-text', StreamRenderer);

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
