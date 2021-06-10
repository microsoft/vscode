/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IEditorConstructionOptions } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { RenderOutputType, ICommonNotebookEditor, ICellOutputViewModel, IRenderOutput, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class CodeRendererContrib extends Disposable implements IOutputTransformContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

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

	render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement): IRenderOutput {
		const value = getStringValue(item);
		return this._render(output, container, value, 'javascript');
	}

	protected _render(output: ICellOutputViewModel, container: HTMLElement, value: string, modeId: string): IRenderOutput {
		const disposable = new DisposableStore();
		const editor = this.instantiationService.createInstance(CodeEditorWidget, container, getOutputSimpleEditorOptions(), { isSimpleWidget: true });

		const mode = this.modeService.create(modeId);
		const textModel = this.modelService.createModel(value, mode, undefined, false);
		editor.setModel(textModel);

		const width = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).width;
		const fontInfo = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).fontInfo;
		const height = Math.min(textModel.getLineCount(), 16) * (fontInfo.lineHeight || 18);

		editor.layout({ height, width });

		disposable.add(editor);
		disposable.add(textModel);

		container.style.height = `${height + 8}px`;

		return { type: RenderOutputType.Mainframe, initHeight: height, disposable };
	}
}

export class NotebookCodeRendererContribution extends Disposable {

	constructor(@IModeService _modeService: IModeService) {
		super();

		const registeredLanguages: string[] = []
		const registerCodeRendererContrib = (languageId: string) => {
			if (registeredLanguages.includes(languageId)) { return; }

			OutputRendererRegistry.registerOutputTransform(class extends CodeRendererContrib {
				override getMimetypes() {
					return [`application/${languageId}`];
				}

				override render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement): IRenderOutput {
					const str = getStringValue(item);
					return this._render(output, container, str, languageId);
				}
			});

			registeredLanguages.push(languageId);
		};

		_modeService.getRegisteredModes().forEach(id => {
			registerCodeRendererContrib(id);
		});

		this._register(_modeService.onDidCreateMode((e) => {
			registerCodeRendererContrib(e.getId());
		}));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookCodeRendererContribution, LifecyclePhase.Eventually);


// --- utils ---
function getStringValue(item: IOutputItemDto): string {
	// todo@jrieken NOT proper, should be VSBuffer
	return new TextDecoder().decode(item.data);
}

function getOutputSimpleEditorOptions(): IEditorConstructionOptions {
	return {
		dimension: { height: 0, width: 0 },
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
		},
		automaticLayout: true,
	};
}
