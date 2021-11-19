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
import { RenderOutputType, ICellOutputViewModel, IRenderOutput } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { OutputRendererRegistry } from 'vs/workbench/contrib/notebook/browser/view/output/rendererRegistry';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { INotebookDelegateForOutput, IOutputTransformContribution } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';

abstract class CodeRendererContrib extends Disposable implements IOutputTransformContribution {
	getType() {
		return RenderOutputType.Mainframe;
	}

	abstract getMimetypes(): string[];

	constructor(
		public notebookEditor: INotebookDelegateForOutput,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
	) {
		super();
	}

	abstract render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement): IRenderOutput;

	protected _render(output: ICellOutputViewModel, container: HTMLElement, value: string, languageId: string): IRenderOutput {
		const disposable = new DisposableStore();
		const editor = this.instantiationService.createInstance(CodeEditorWidget, container, getOutputSimpleEditorOptions(), { isSimpleWidget: true, contributions: this.notebookEditor.creationOptions.cellEditorContributions });

		if (output.cellViewModel instanceof CodeCellViewModel) {
			disposable.add(output.cellViewModel.viewContext.eventDispatcher.onDidChangeLayout(() => {
				const outputWidth = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).width;
				const fontInfo = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).fontInfo;
				const editorHeight = Math.min(16 * (fontInfo.lineHeight || 18), editor.getLayoutInfo().height);

				editor.layout({ height: editorHeight, width: outputWidth });
				container.style.height = `${editorHeight + 8}px`;
			}));
		}

		disposable.add(editor.onDidContentSizeChange(e => {
			const outputWidth = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).width;
			const fontInfo = this.notebookEditor.getCellOutputLayoutInfo(output.cellViewModel).fontInfo;
			const editorHeight = Math.min(16 * (fontInfo.lineHeight || 18), e.contentHeight);

			editor.layout({ height: editorHeight, width: outputWidth });
			container.style.height = `${editorHeight + 8}px`;
		}));

		const mode = this.modeService.create(languageId);
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

		const registeredMimeTypes = new Map();
		const registerCodeRendererContrib = (mimeType: string, languageId: string) => {
			if (registeredMimeTypes.has(mimeType)) {
				return;
			}

			OutputRendererRegistry.registerOutputTransform(class extends CodeRendererContrib {
				getMimetypes() {
					return [mimeType];
				}

				render(output: ICellOutputViewModel, item: IOutputItemDto, container: HTMLElement): IRenderOutput {
					const str = item.data.toString();
					return this._render(output, container, str, languageId);
				}
			});

			registeredMimeTypes.set(mimeType, true);
		};

		_modeService.getRegisteredModes().forEach(id => {
			registerCodeRendererContrib(`text/x-${id}`, id);
		});

		this._register(_modeService.onDidEncounterLanguage((languageId) => {
			registerCodeRendererContrib(`text/x-${languageId}`, languageId);
		}));

		registerCodeRendererContrib('application/json', 'json');
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(NotebookCodeRendererContribution, LifecyclePhase.Restored);


// --- utils ---

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
