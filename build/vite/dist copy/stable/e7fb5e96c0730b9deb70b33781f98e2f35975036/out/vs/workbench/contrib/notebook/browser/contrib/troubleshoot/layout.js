/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { INotebookService } from '../../../common/notebookService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { n } from '../../../../../../base/browser/dom.js';
export class TroubleshootController extends Disposable {
    static { this.id = 'workbench.notebook.troubleshoot'; }
    constructor(_notebookEditor) {
        super();
        this._notebookEditor = _notebookEditor;
        this._localStore = this._register(new DisposableStore());
        this._cellDisposables = [];
        this._enabled = false;
        this._cellStatusItems = [];
        this._register(this._notebookEditor.onDidChangeModel(() => {
            this._update();
        }));
        this._update();
    }
    toggle() {
        this._enabled = !this._enabled;
        this._update();
    }
    _update() {
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
    _log(cell, e) {
        if (this._enabled) {
            const oldHeight = this._notebookEditor.getViewHeight(cell);
            console.log(`cell#${cell.handle}`, e, `${oldHeight} -> ${cell.layoutInfo.totalHeight}`);
        }
    }
    _createCellOverlays() {
        if (!this._notebookEditor.hasModel()) {
            return;
        }
        for (let i = 0; i < this._notebookEditor.getLength(); i++) {
            const cell = this._notebookEditor.cellAt(i);
            this._createCellOverlay(cell, i);
        }
        // Add listener for new cells
        this._localStore.add(this._notebookEditor.onDidChangeViewCells(e => {
            const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
            for (let i = 0; i < addedCells.length; i++) {
                const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
                if (cellIndex !== undefined) {
                    this._createCellOverlay(addedCells[i], cellIndex);
                }
            }
        }));
    }
    _createNotebookOverlay() {
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
                const labelElement = this._notebookOverlayDomNode.querySelector('div:nth-child(2)');
                if (labelElement) {
                    labelElement.textContent = `ScrollTop: ${scrollTop}px`;
                    labelElement.style.top = `${listViewTop}px`;
                }
                // Update top line
                // eslint-disable-next-line no-restricted-syntax
                const topLineElement = this._notebookOverlayDomNode.querySelector('div:first-child');
                if (topLineElement) {
                    topLineElement.style.top = `${listViewTop}px`;
                }
            }
        }));
    }
    _createCellOverlay(cell, index) {
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
        let overlayId = undefined;
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
                        accessor.layoutOverlay(overlayId);
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
    _removeNotebookOverlay() {
        if (this._notebookOverlayDomNode) {
            this._notebookOverlayDomNode.remove();
            this._notebookOverlayDomNode = undefined;
        }
    }
    _updateListener() {
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
            const addedCells = e.splices.reduce((acc, [, , newCells]) => [...acc, ...newCells], []);
            for (let i = 0; i < addedCells.length; i++) {
                const cellIndex = this._notebookEditor.getCellIndex(addedCells[i]);
                if (cellIndex !== undefined) {
                    this._createCellOverlay(addedCells[i], cellIndex);
                }
            }
        }));
        const vm = this._notebookEditor.getViewModel();
        let items = [];
        if (this._enabled) {
            items = this._getItemsForCells();
        }
        this._cellStatusItems = vm.deltaCellStatusBarItems(this._cellStatusItems, items);
    }
    _getItemsForCells() {
        const items = [];
        for (let i = 0; i < this._notebookEditor.getLength(); i++) {
            items.push({
                handle: i,
                items: [
                    {
                        text: `index: ${i}`,
                        alignment: 1 /* CellStatusbarAlignment.Left */,
                        priority: Number.MAX_SAFE_INTEGER
                    }
                ]
            });
        }
        return items;
    }
    dispose() {
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
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const controller = editor.getContribution(TroubleshootController.id);
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
    async run(accessor) {
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
    async run(accessor) {
        const notebookService = accessor.get(INotebookService);
        notebookService.clearEditorCache();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL3Ryb3VibGVzaG9vdC9sYXlvdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ2hILE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sb0VBQW9FLENBQUM7QUFDaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUVoRyxPQUFPLEVBQUUsK0JBQStCLEVBQWtHLE1BQU0sMEJBQTBCLENBQUM7QUFDM0ssT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHakYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUUxRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsVUFBVTthQUM5QyxPQUFFLEdBQVcsaUNBQWlDLEFBQTVDLENBQTZDO0lBUXRELFlBQTZCLGVBQWdDO1FBQzVELEtBQUssRUFBRSxDQUFDO1FBRG9CLG9CQUFlLEdBQWYsZUFBZSxDQUFpQjtRQU41QyxnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO1FBQzdELHFCQUFnQixHQUFzQixFQUFFLENBQUM7UUFDekMsYUFBUSxHQUFZLEtBQUssQ0FBQztRQUMxQixx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