/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { getNotebookEditorFromEditorPane, ICellViewModel, INotebookDeltaCellStatusBarItems, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { NotebookEditorWidget } from '../../notebookEditorWidget.js';
import { CellStatusbarAlignment, INotebookCellStatusBarItem } from '../../../common/notebookCommon.js';
import { INotebookService } from '../../../common/notebookService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { n } from '../../../../../../base/browser/dom.js';

export class TroubleshootController extends Disposable implements INotebookEditorContribution {
	static id: string = 'workbench.notebook.troubleshoot';

	private readonly _localStore = this._register(new DisposableStore());
	private _cellDisposables: DisposableStore[] = [];
	private _enabled: boolean = false;
	private _cellStatusItems: string[] = [];
	private _notebookOverlayDomNode: HTMLElement | undefined;

	constructor(private readonly _notebookEditor: INotebookEditor) {
		super();

		this._register(this._notebookEditor.onDidChangeModel(() => {
			this._update();
		}));

		this._update();
	}

	toggle(): void {
		this._enabled = !this._enabled;
		this._update();
	}

	private _update() {
		this._localStore.clear();
		this._cellDisposables.forEach(d => d.dispose());
		this._cellDisposables = [];
		this._removeNotebookOverlay();

		if (!this._notebookEditor.hasModel()) {
			return;
		}

		if (this._enabled) {
			this._updateListener();
			this._createNotebookOverlay();
			this._createCellOverlays();
		}
	}

	private _log(cell: ICellViewModel, e: any) {
		if (this._enabled) {
			const oldHeight = (this._notebookEditor as NotebookEditorWidget).getViewHeight(cell);
			console.log(`cell#${cell.handle}`, e, `${oldHeight} -> ${cell.layoutInfo.totalHeight}`);
		}
	}

	private _createCellOverlays() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		for (let i = 0; i < this._notebookEditor.getLength(); i++) {
			const cell = this._notebookEditor.cellAt(i);
			this._createCellOverlay(cell, i);
		}

		// Add listener for new cells
		this._localStore.add(this._notebookEditor.onDidChangeViewCells(e => {
			const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], [] as ICellViewModel[]);
			for (let i = 0; i < addedCells.length; i++) {
				const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
				if (cellIndex !== undefined) {
					this._createCellOverlay(addedCells[i], cellIndex);
				}
			}
		}));
	}

	private _createNotebookOverlay() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		const listViewTop = this._notebookEditor.getLayoutInfo().listViewOffsetTop;
		const scrollTop = this._notebookEditor.scrollTop;

		const overlay = n.div({
			style: {
				position: 'absolute',
				top: '0',
				left: '0',
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: '1000'
			}
		}, [
			// Top line
			n.div({
				style: {
					position: 'absolute',
					top: `${listViewTop}px`,
					left: '0',
					width: '100%',
					height: '2px',
					backgroundColor: 'rgba(0, 0, 255, 0.7)'
				}
			}),
			// Text label for the notebook overlay
			n.div({
				style: {
					position: 'absolute',
					top: `${listViewTop}px`,
					left: '10px',
					backgroundColor: 'rgba(0, 0, 255, 0.7)',
					color: 'white',
					fontSize: '11px',
					fontWeight: 'bold',
					padding: '2px 6px',
					borderRadius: '3px',
					whiteSpace: 'nowrap',
					pointerEvents: 'none',
					zIndex: '1001'
				}
			}, [`ScrollTop: ${scrollTop}px`])
		]).keepUpdated(this._store);

		this._notebookOverlayDomNode = overlay.element;

		if (this._notebookOverlayDomNode) {
			this._notebookEditor.getDomNode().appendChild(this._notebookOverlayDomNode);
		}

		this._localStore.add(this._notebookEditor.onDidScroll(() => {
			const scrollTop = this._notebookEditor.scrollTop;
			const listViewTop = this._notebookEditor.getLayoutInfo().listViewOffsetTop;

			if (this._notebookOverlayDomNode) {
				// Update label
				// eslint-disable-next-line no-restricted-syntax
				const labelElement = this._notebookOverlayDomNode.querySelector('div:nth-child(2)') as HTMLElement;
				if (labelElement) {
					labelElement.textContent = `ScrollTop: ${scrollTop}px`;
					labelElement.style.top = `${listViewTop}px`;
				}

				// Update top line
				// eslint-disable-next-line no-restricted-syntax
				const topLineElement = this._notebookOverlayDomNode.querySelector('div:first-child') as HTMLElement;
				if (topLineElement) {
					topLineElement.style.top = `${listViewTop}px`;
				}
			}
		}));
	}

	private _createCellOverlay(cell: ICellViewModel, index: number) {
		const overlayContainer = document.createElement('div');
		overlayContainer.style.position = 'absolute';
		overlayContainer.style.top = '0';
		overlayContainer.style.left = '0';
		overlayContainer.style.width = '100%';
		overlayContainer.style.height = '100%';
		overlayContainer.style.pointerEvents = 'none';
		overlayContainer.style.zIndex = '1000';
		const topLine = document.createElement('div');
		topLine.style.position = 'absolute';
		topLine.style.top = '0';
		topLine.style.left = '0';
		topLine.style.width = '100%';
		topLine.style.height = '2px';
		topLine.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
		overlayContainer.appendChild(topLine);

		const getLayoutInfo = () => {
			const eol = cell.textBuffer.getEOL() === '\n' ? 'LF' : 'CRLF';
			let scrollTop = '';
			if (cell.layoutInfo.layoutState > 0) {
				scrollTop = `| AbsoluteTopOfElement: ${this._notebookEditor.getAbsoluteTopOfElement(cell)}px`;
			}
			return `cell #${index} (handle: ${cell.handle}) ${scrollTop} | EOL: ${eol}`;
		};
		const label = document.createElement('div');
		label.textContent = getLayoutInfo();
		label.style.position = 'absolute';
		label.style.top = '0px';
		label.style.right = '10px';
		label.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
		label.style.color = 'white';
		label.style.fontSize = '11px';
		label.style.fontWeight = 'bold';
		label.style.padding = '2px 6px';
		label.style.borderRadius = '3px';
		label.style.whiteSpace = 'nowrap';
		label.style.pointerEvents = 'none';
		label.style.zIndex = '1001';
		overlayContainer.appendChild(label);

		let overlayId: string | undefined = undefined;
		this._notebookEditor.changeCellOverlays((accessor) => {
			overlayId = accessor.addOverlay({
				cell,
				domNode: overlayContainer
			});
		});

		if (overlayId) {

			// Update overlay when layout changes
			const updateLayout = () => {
				// Update label text
				label.textContent = getLayoutInfo();

				// Refresh the overlay position
				if (overlayId) {
					this._notebookEditor.changeCellOverlays((accessor) => {
						accessor.layoutOverlay(overlayId!);
					});
				}
			};

			const disposables = this._cellDisposables[index];
			disposables.add(cell.onDidChangeLayout((e) => {
				updateLayout();
			}));
			disposables.add(cell.textBuffer.onDidChangeContent(() => {
				updateLayout();
			}));
			if (cell.textModel) {
				disposables.add(cell.textModel.onDidChangeContent(() => {
					updateLayout();
				}));
			}
			disposables.add(this._notebookEditor.onDidChangeLayout(() => {
				updateLayout();
			}));
			disposables.add(toDisposable(() => {
				this._notebookEditor.changeCellOverlays((accessor) => {
					if (overlayId) {
						accessor.removeOverlay(overlayId);
					}
				});
			}));
		}

	}

	private _removeNotebookOverlay() {
		if (this._notebookOverlayDomNode) {
			this._notebookOverlayDomNode.remove();
			this._notebookOverlayDomNode = undefined;
		}
	}

	private _updateListener() {
		if (!this._notebookEditor.hasModel()) {
			return;
		}

		for (let i = 0; i < this._notebookEditor.getLength(); i++) {
			const cell = this._notebookEditor.cellAt(i);

			const disposableStore = new DisposableStore();
			this._cellDisposables.push(disposableStore);
			disposableStore.add(cell.onDidChangeLayout(e => {
				this._log(cell, e);
			}));
		}

		this._localStore.add(this._notebookEditor.onDidChangeViewCells(e => {
			[...e.splices].reverse().forEach(splice => {
				const [start, deleted, newCells] = splice;
				const deletedCells = this._cellDisposables.splice(start, deleted, ...newCells.map(cell => {
					const disposableStore = new DisposableStore();
					disposableStore.add(cell.onDidChangeLayout(e => {
						this._log(cell, e);
					}));
					return disposableStore;
				}));

				dispose(deletedCells);
			});

			// Add the overlays
			const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], [] as ICellViewModel[]);
			for (let i = 0; i < addedCells.length; i++) {
				const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
				if (cellIndex !== undefined) {
					this._createCellOverlay(addedCells[i], cellIndex);
				}
			}
		}));

		const vm = this._notebookEditor.getViewModel();
		let items: INotebookDeltaCellStatusBarItems[] = [];

		if (this._enabled) {
			items = this._getItemsForCells();
		}

		this._cellStatusItems = vm.deltaCellStatusBarItems(this._cellStatusItems, items);

	}

	private _getItemsForCells(): INotebookDeltaCellStatusBarItems[] {
		const items: INotebookDeltaCellStatusBarItems[] = [];
		for (let i = 0; i < this._notebookEditor.getLength(); i++) {
			items.push({
				handle: i,
				items: [
					{
						text: `index: ${i}`,
						alignment: CellStatusbarAlignment.Left,
						priority: Number.MAX_SAFE_INTEGER
					} satisfies INotebookCellStatusBarItem
				]
			});
		}

		return items;
	}

	override dispose() {
		dispose(this._cellDisposables);
		this._removeNotebookOverlay();
		this._localStore.clear();
		super.dispose();
	}
}

registerNotebookContribution(TroubleshootController.id, TroubleshootController);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.toggleLayoutTroubleshoot',
			title: localize2('workbench.notebook.toggleLayoutTroubleshoot', "Toggle Notebook Layout Troubleshoot"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<TroubleshootController>(TroubleshootController.id);
		controller?.toggle();
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.inspectLayout',
			title: localize2('workbench.notebook.inspectLayout', "Inspect Notebook Layout"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor || !editor.hasModel()) {
			return;
		}

		for (let i = 0; i < editor.getLength(); i++) {
			const cell = editor.cellAt(i);
			console.log(`cell#${cell.handle}`, cell.layoutInfo);
		}
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'notebook.clearNotebookEdtitorTypeCache',
			title: localize2('workbench.notebook.clearNotebookEdtitorTypeCache', "Clear Notebook Editor Type Cache"),
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const notebookService = accessor.get(INotebookService);
		notebookService.clearEditorCache();
	}
});
