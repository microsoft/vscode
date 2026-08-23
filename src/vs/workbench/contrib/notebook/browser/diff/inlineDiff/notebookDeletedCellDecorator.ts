/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { DefaultLineHeight } from '../diffElementViewModel.js';
import { CellDiffInfo } from '../notebookDiffViewModel.js';
import { INotebookEditor, NotebookOverviewRulerLane } from '../../notebookBrowser.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { MenuWorkbenchToolBar, HiddenItemStrategy } from '../../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { overviewRulerDeletedForeground } from '../../../../scm/common/quickDiff.js';
import { IActionViewItemProvider } from '../../../../../../base/browser/ui/actionbar/actionbar.js';

const ttPolicy = createTrustedTypesPolicy('notebookRenderer', { createHTML: value => value });

export interface INotebookDeletedCellDecorator {
	getTop(deletedIndex: number): number | undefined;
}


export class NotebookDeletedCellDecorator extends Disposable implements INotebookDeletedCellDecorator {
	private readonly zoneRemover = this._register(new DisposableStore());
	private readonly createdViewZones = new Map<number, string>();
	private readonly deletedCellInfos = new Map<number, { height: number; previousIndex: number; offset: number }>();
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly toolbar: { menuId: MenuId; className: string; telemetrySource?: string; argFactory: (deletedCellIndex: number) => any; actionViewItemProvider?: IActionViewItemProvider } | undefined,
		@ILanguageService private readonly languageService: ILanguageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	public getTop(deletedIndex: number) {
		const info = this.deletedCellInfos.get(deletedIndex);
		if (!info) {
			return;
		}
		if (info.previousIndex === -1) {
			// deleted cell is before the first real cell
			return 0;
		}
		const cells = this._notebookEditor.getCellsInRange({ start: info.previousIndex, end: info.previousIndex + 1 });
		if (!cells.length) {
			return this._notebookEditor.getLayoutInfo().height + info.offset;
		}
		const cell = cells[0];
		const cellHeight = this._notebookEditor.getHeightOfElement(cell);
		const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
		return top + cellHeight + info.offset;
	}

	reveal(deletedIndex: number) {
		const top = this.getTop(deletedIndex);
		if (typeof top === 'number') {
			this._notebookEditor.focusContainer();
			this._notebookEditor.revealOffsetInCenterIfOutsideViewport(top);

			const info = this.deletedCellInfos.get(deletedIndex);

			if (info) {
				const prevIndex = info.previousIndex === -1 ? 0 : info.previousIndex;
				this._notebookEditor.setFocus({ start: prevIndex, end: prevIndex });
				this._notebookEditor.setSelections([{ start: prevIndex, end: prevIndex }]);
			}
		}
	}

	public apply(diffInfo: CellDiffInfo[], original: NotebookTextModel): void {
		this.clear();

		let currentIndex = -1;
		const deletedCellsToRender: { cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]; index: number } = { cells: [], index: 0 };
		diffInfo.forEach(diff => {
			if (diff.type === 'delete') {
				const deletedCell = original.cells[diff.originalCellIndex];
				if (deletedCell) {
					deletedCellsToRender.cells.push({ cell: deletedCell, originalIndex: diff.originalCellIndex, previousIndex: currentIndex });
					deletedCellsToRender.index = currentIndex;
				}
			} else {
				if (deletedCellsToRender.cells.length) {
					this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
					deletedCellsToRender.cells.length = 0;
				}
				currentIndex = diff.modifiedCellIndex;
			}
		});
		if (deletedCellsToRender.cells.length) {
			this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
		}
	}

	public clear() {
		this.deletedCellInfos.clear();
		this.zoneRemover.clear();
	}


	private _createWidget(index: number, cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]) {
		this._createWidgetImpl(index, cells);
	}
	private async _createWidgetImpl(index: number, cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]) {
		const rootContainer = document.createElement('div');
		const widgets: NotebookDeletedCellWidget[] = [];
		const heights = await Promise.all(cells.map(async cell => {
			const widget = new NotebookDeletedCellWidget(this._notebookEditor, this.toolbar, cell.cell.getValue(), cell.cell.language, rootContainer, cell.originalIndex, this.languageService, this.instantiationService);
			widgets.push(widget);
			const height = await widget.render();
			this.deletedCellInfos.set(cell.originalIndex, { height, previousIndex: cell.previousIndex, offset: 0 });
			return height;
		}));

		Array.from(this.deletedCellInfos.keys()).sort((a, b) => a - b).forEach((originalIndex) => {
			const previousDeletedCell = this.deletedCellInfos.get(originalIndex - 1);
			if (previousDeletedCell) {
				const deletedCell = this.deletedCellInfos.get(originalIndex);
				if (deletedCell) {
					deletedCell.offset = previousDeletedCell.height + previousDeletedCell.offset;
				}
			}
		});

		const totalHeight = heights.reduce<number>((prev, curr) => prev + curr, 0);

		this._notebookEditor.changeViewZones(accessor => {
			const notebookViewZone = {
				afterModelPosition: index,
				heightInPx: totalHeight + 4,
				domNode: rootContainer
			};

			const id = accessor.addZone(notebookViewZone);
			accessor.layoutZone(id);
			this.createdViewZones.set(index, id);

			const deletedCellOverviewRulereDecorationIds = this._notebookEditor.deltaCellDecorations([], [{
				viewZoneId: id,
				options: {
					overviewRuler: {
						color: overviewRulerDeletedForeground,
						position: NotebookOverviewRulerLane.Center,
					}
				}
			}]);
			this.zoneRemover.add(toDisposable(() => {
				if (this.createdViewZones.get(index) === id) {
					this.createdViewZones.delete(index);
				}
				if (!this._notebookEditor.isDisposed) {
					this._notebookEditor.changeViewZones(accessor => {
						accessor.removeZone(id);
						dispose(widgets);
					});

					this._notebookEditor.deltaCellDecorations(deletedCellOverviewRulereDecorationIds, []);
				}
			}));
		});
	}

}

export class NotebookDeletedCellWidget extends Disposable {
	private readonly container: HTMLElement;
	// private readonly toolbar: HTMLElement;

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _toolbarOptions: { menuId: MenuId; className: string; telemetrySource?: string; argFactory: (deletedCellIndex: number) => any; actionViewItemProvider?: IActionViewItemProvider } | undefined,
		private readonly code: string,
		private readonly language: string,
		container: HTMLElement,
		private readonly _originalIndex: number,
		@ILanguageService private readonly languageService: ILanguageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.container = DOM.append(container, document.createElement('div'));
		this._register(toDisposable(() => {
			container.removeChild(this.container);
		}));
	}

	public async render() {
		const code = this.code;
		const languageId = this.language;
		const codeHtml = await tokenizeToString(this.languageService, code, languageId);

		// const colorMap = this.getDefaultColorMap();
		const fontInfo = this._notebookEditor.getBaseCellEditorOptions(languageId).value;
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';
		// If we have any editors, then use left layout of one of those.
		const editor = this._notebookEditor.codeEditors.map(c => c[1]).find(c => c);
		const layoutInfo = editor?.getOptions().get(EditorOption.layoutInfo);

		const style = ``
			+ `font-family: var(${fontFamilyVar});`
			+ `font-weight: var(${fontWeightVar});`
			+ `font-size: var(${fontSizeVar});`
			+ fontInfo.lineHeight ? `line-height: ${fontInfo.lineHeight}px;` : ''
				+ layoutInfo?.contentLeft ? `margin-left: ${layoutInfo}px;` : ''
		+ `white-space: pre;`;

		const rootContainer = this.container;
		rootContainer.classList.add('code-cell-row');

		if (this._toolbarOptions) {
			const toolbar = document.createElement('div');
			toolbar.className = this._toolbarOptions.className;
			rootContainer.appendChild(toolbar);

			const scopedInstaService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this._notebookEditor.scopedContextKeyService])));
			const toolbarWidget = scopedInstaService.createInstance(MenuWorkbenchToolBar, toolbar, this._toolbarOptions.menuId, {
				telemetrySource: this._toolbarOptions.telemetrySource,
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				toolbarOptions: { primaryGroup: () => true },
				menuOptions: {
					renderShortTitle: true,
					arg: this._toolbarOptions.argFactory(this._originalIndex),
				},
				actionViewItemProvider: this._toolbarOptions.actionViewItemProvider
			});
			this._store.add(toolbarWidget);

			toolbar.style.position = 'absolute';
			toolbar.style.right = '40px';
			toolbar.style.zIndex = '10';
			toolbar.classList.add('hover'); // Show by default
		}

		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		container.style.position = 'relative'; // Add this line

		const focusIndicatorLeft = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
		const cellContainer = DOM.append(container, DOM.$('.cell.code'));
		DOM.append(focusIndicatorLeft, DOM.$('div.execution-count-label'));
		const editorPart = DOM.append(cellContainer, DOM.$('.cell-editor-part'));
		let editorContainer = DOM.append(editorPart, DOM.$('.cell-editor-container'));
		editorContainer = DOM.append(editorContainer, DOM.$('.code', { style }));
		if (fontInfo.fontFamily) {
			editorContainer.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		}
		if (fontInfo.fontSize) {
			editorContainer.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
		}
		if (fontInfo.fontWeight) {
			editorContainer.style.setProperty(fontWeightVar, fontInfo.fontWeight);
		}
		editorContainer.innerHTML = (ttPolicy?.createHTML(codeHtml) || codeHtml) as string;

		const lineCount = splitLines(code).length;
		const height = (lineCount * (fontInfo.lineHeight || DefaultLineHeight)) + 12 + 12; // We have 12px top and bottom in generated code HTML;
		const totalHeight = height + 16 + 16;

		return totalHeight;
	}
}
