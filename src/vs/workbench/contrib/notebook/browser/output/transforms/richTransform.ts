/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IOutputTransformContribution, IRenderOutput } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { registerOutputTransform } from 'vs/workbench/contrib/notebook/browser/notebookRegistry';
import * as DOM from 'vs/base/browser/dom';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { isArray } from 'vs/base/common/types';
import * as marked from 'vs/base/common/marked/marked';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { URI } from 'vs/base/common/uri';

class RichRenderer implements IOutputTransformContribution {
	private _mdRenderer: marked.Renderer = new marked.Renderer({ gfm: true });;

	constructor(
		public handler: INotebookEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService
	) {
	}

	render(output: any, container: HTMLElement): IRenderOutput {
		let hasDynamicHeight = false;

		if (output.data) {
			if (output.data['application/json']) {
				let data = output.data['application/json'];
				let str = JSON.stringify(data, null, '\t');

				const editor = this.instantiationService.createInstance(CodeEditorWidget, container, {
					...getJSONSimpleEditorOptions(),
					dimension: {
						width: 0,
						height: 0
					}
				}, {
					isSimpleWidget: true
				});

				let mode = this.modeService.create('json');
				let resource = URI.parse(`notebook-output-${Date.now()}.json`);
				const textModel = this.modelService.createModel(str, mode, resource, false);
				editor.setModel(textModel);

				let width = this.handler.getListDimension()!.width;
				let fontInfo = this.handler.getFontInfo();
				let height = Math.min(textModel.getLineCount(), 16) * (fontInfo?.lineHeight || 18);

				editor.layout({
					height,
					width
				});

				container.style.height = `${height + 16}px`;

				return {
					hasDynamicHeight: true
				};
			} else if (output.data['application/javascript']) {
				let data = output.data['application/javascript'];
				let str = isArray(data) ? data.join('') : data;
				let scriptVal = `<script type="application/javascript">${str}</script>`;
				hasDynamicHeight = false;
				return {
					shadowContent: scriptVal,
					hasDynamicHeight
				};
			} else if (output.data['text/html']) {
				let data = output.data['text/html'];
				let str = isArray(data) ? data.join('') : data;
				hasDynamicHeight = false;
				return {
					shadowContent: str,
					hasDynamicHeight
				};
			} else if (output.data['image/svg+xml']) {
				let data = output.data['image/svg+xml'];
				let str = isArray(data) ? data.join('') : data;
				hasDynamicHeight = false;
				return {
					shadowContent: str,
					hasDynamicHeight
				};
			} else if (output.data['text/markdown']) {
				let data = output.data['text/markdown'];
				const str = isArray(data) ? data.join('') : data;
				const mdOutput = document.createElement('div');
				mdOutput.innerHTML = marked(str, { renderer: this._mdRenderer });
				container.appendChild(mdOutput);
				hasDynamicHeight = true;
			} else if (output.data['image/png']) {
				const image = document.createElement('img');
				image.src = `data:image/png;base64,${output.data['image/png']}`;
				const display = document.createElement('div');
				DOM.addClasses(display, 'display');
				display.appendChild(image);
				container.appendChild(display);
				hasDynamicHeight = true;
			} else if (output.data['image/jpeg']) {
				const image = document.createElement('img');
				image.src = `data:image/jpeg;base64,${output.data['image/jpeg']}`;
				const display = document.createElement('div');
				DOM.addClasses(display, 'display');
				display.appendChild(image);
				container.appendChild(display);
				hasDynamicHeight = true;
			} else if (output.data['text/plain']) {
				let data = output.data['text/plain'];
				let str = isArray(data) ? data.join('') : data;
				const contentNode = document.createElement('p');
				contentNode.innerText = str;
				container.appendChild(contentNode);
			} else {
				const contentNode = document.createElement('p');
				let mimeTypes = [];
				for (const property in output.data) {
					mimeTypes.push(property);
				}

				let mimeTypesMessage = mimeTypes.join(', ');

				contentNode.innerText = `No renderer could be found for output. It has the following MIME types: ${mimeTypesMessage}`;
				container.appendChild(contentNode);
			}
		} else {
			const contentNode = document.createElement('p');
			contentNode.innerText = `No data could be found for output.`;
			container.appendChild(contentNode);
		}

		return {
			hasDynamicHeight
		};
	}

	dispose(): void {
	}
}

registerOutputTransform('notebook.output.rich', ['display_data', 'execute_result'], RichRenderer);


export function getJSONSimpleEditorOptions(): IEditorOptions {
	return {
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
