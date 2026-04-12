/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
const invalidFunc = () => { throw new Error(`Invalid notebook view zone change accessor`); };
export class NotebookViewZones extends Disposable {
    constructor(listView, coordinator) {
        super();
        this.listView = listView;
        this.coordinator = coordinator;
        this.domNode = createFastDomNode(document.createElement('div'));
        this.domNode.setClassName('view-zones');
        this.domNode.setPosition('absolute');
        this.domNode.setAttribute('role', 'presentation');
        this.domNode.setAttribute('aria-hidden', 'true');
        this.domNode.setWidth('100%');
        this._zones = {};
        this.listView.containerDomNode.appendChild(this.domNode.domNode);
    }
    changeViewZones(callback) {
        let zonesHaveChanged = false;
        const changeAccessor = {
            addZone: (zone) => {
                zonesHaveChanged = true;
                return this._addZone(zone);
            },
            removeZone: (id) => {
                zonesHaveChanged = true;
                // TODO: validate if zones have changed layout
                this._removeZone(id);
            },
            layoutZone: (id) => {
                zonesHaveChanged = true;
                // TODO: validate if zones have changed layout
                this._layoutZone(id);
            }
        };
        safeInvoke1Arg(callback, changeAccessor);
        // Invalidate changeAccessor
        changeAccessor.addZone = invalidFunc;
        changeAccessor.removeZone = invalidFunc;
        changeAccessor.layoutZone = invalidFunc;
        return zonesHaveChanged;
    }
    getViewZoneLayoutInfo(viewZoneId) {
        const zoneWidget = this._zones[viewZoneId];
        if (!zoneWidget) {
            return null;
        }
        const top = this.listView.getWhitespacePosition(zoneWidget.whitespaceId);
        const height = zoneWidget.zone.heightInPx;
        return { height: height, top: top };
    }
    onCellsChanged(e) {
        const splices = e.splices.slice().reverse();
        splices.forEach(splice => {
            const [start, deleted, newCells] = splice;
            const fromIndex = start;
            const toIndex = start + deleted;
            // 1, 2, 0
            // delete cell index 1 and 2
            // from index 1, to index 3 (exclusive): [1, 3)
            // if we have whitespace afterModelPosition 3, which is after cell index 2
            for (const id in this._zones) {
                const zone = this._zones[id].zone;
                const cellBeforeWhitespaceIndex = zone.afterModelPosition - 1;
                if (cellBeforeWhitespaceIndex >= fromIndex && cellBeforeWhitespaceIndex < toIndex) {
                    // The cell this whitespace was after has been deleted
                    //  => move whitespace to before first deleted cell
                    zone.afterModelPosition = fromIndex;
                    this._updateWhitespace(this._zones[id]);
                }
                else if (cellBeforeWhitespaceIndex >= toIndex) {
                    // adjust afterModelPosition for all other cells
                    const insertLength = newCells.length;
                    const offset = insertLength - deleted;
                    zone.afterModelPosition += offset;
                    this._updateWhitespace(this._zones[id]);
                }
            }
        });
    }
    onHiddenRangesChange() {
        for (const id in this._zones) {
            this._updateWhitespace(this._zones[id]);
        }
    }
    _updateWhitespace(zone) {
        const whitespaceId = zone.whitespaceId;
        const viewPosition = this.coordinator.convertModelIndexToViewIndex(zone.zone.afterModelPosition);
        const isInHiddenArea = this._isInHiddenRanges(zone.zone);
        zone.isInHiddenArea = isInHiddenArea;
        this.listView.changeOneWhitespace(whitespaceId, viewPosition, isInHiddenArea ? 0 : zone.zone.heightInPx);
    }
    layout() {
        for (const id in this._zones) {
            this._layoutZone(id);
        }
    }
    _addZone(zone) {
        const viewPosition = this.coordinator.convertModelIndexToViewIndex(zone.afterModelPosition);
        const whitespaceId = this.listView.insertWhitespace(viewPosition, zone.heightInPx);
        const isInHiddenArea = this._isInHiddenRanges(zone);
        const myZone = {
            whitespaceId: whitespaceId,
            zone: zone,
            domNode: createFastDomNode(zone.domNode),
            isInHiddenArea: isInHiddenArea
        };
        this._zones[whitespaceId] = myZone;
        myZone.domNode.setPosition('absolute');
        myZone.domNode.domNode.style.width = '100%';
        myZone.domNode.setDisplay('none');
        myZone.domNode.setAttribute('notebook-view-zone', whitespaceId);
        this.domNode.appendChild(myZone.domNode);
        return whitespaceId;
    }
    _removeZone(id) {
        this.listView.removeWhitespace(id);
        const zoneWidget = this._zones[id];
        if (zoneWidget) {
            // safely remove the dom node from its parent
            try {
                this.domNode.removeChild(zoneWidget.domNode);
            }
            catch {
                // ignore the error
            }
        }
        delete this._zones[id];
    }
    _layoutZone(id) {
        const zoneWidget = this._zones[id];
        if (!zoneWidget) {
            return;
        }
        this._updateWhitespace(this._zones[id]);
        const isInHiddenArea = this._isInHiddenRanges(zoneWidget.zone);
        if (isInHiddenArea) {
            zoneWidget.domNode.setDisplay('none');
        }
        else {
            const top = this.listView.getWhitespacePosition(zoneWidget.whitespaceId);
            zoneWidget.domNode.setTop(top);
            zoneWidget.domNode.setDisplay('block');
            zoneWidget.domNode.setHeight(zoneWidget.zone.heightInPx);
        }
    }
    _isInHiddenRanges(zone) {
        // The view zone is between two cells (zone.afterModelPosition - 1, zone.afterModelPosition)
        const afterIndex = zone.afterModelPosition;
        // In notebook, the first cell (markdown cell) in a folding range is always visible, so we need to check the cell after the notebook view zone
        return !this.coordinator.modelIndexIsVisible(afterIndex);
    }
    dispose() {
        super.dispose();
        this._zones = {};
    }
}
function safeInvoke1Arg(func, arg1) {
    try {
        func(arg1);
    }
    catch (e) {
        onUnexpectedError(e);
    }
}
class ToggleNotebookViewZoneDeveloperAction extends Action2 {
    static { this.viewZoneIds = []; }
    constructor() {
        super({
            id: 'notebook.developer.addViewZones',
            title: localize2('workbench.notebook.developer.addViewZones', "Toggle Notebook View Zones"),
            category: Categories.Developer,
            precondition: IsDevelopmentContext,
            f1: true
        });
    }
    async run(accessor) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        if (ToggleNotebookViewZoneDeveloperAction.viewZoneIds.length > 0) {
            // remove all view zones
            editor.changeViewZones(accessor => {
                // remove all view zones in reverse order, to follow how we handle this in the prod code
                ToggleNotebookViewZoneDeveloperAction.viewZoneIds.reverse().forEach(id => {
                    accessor.removeZone(id);
                });
                ToggleNotebookViewZoneDeveloperAction.viewZoneIds = [];
            });
        }
        else {
            editor.changeViewZones(accessor => {
                const cells = editor.getCellsInRange();
                if (cells.length === 0) {
                    return;
                }
                const viewZoneIds = [];
                for (let i = 0; i < cells.length; i++) {
                    const domNode = document.createElement('div');
                    domNode.innerText = `View Zone ${i}`;
                    domNode.style.backgroundColor = 'rgba(0, 255, 0, 0.5)';
                    const viewZoneId = accessor.addZone({
                        afterModelPosition: i,
                        heightInPx: 200,
                        domNode: domNode,
                    });
                    viewZoneIds.push(viewZoneId);
                }
                ToggleNotebookViewZoneDeveloperAction.viewZoneIds = viewZoneIds;
            });
        }
    }
}
registerAction2(ToggleNotebookViewZoneDeveloperAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tWaWV3Wm9uZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdQYXJ0cy9ub3RlYm9va1ZpZXdab25lcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQWUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFckUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM3RixPQUFPLEVBQUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUNyRixPQUFPLEVBQUUsK0JBQStCLEVBQXFGLE1BQU0sdUJBQXVCLENBQUM7QUFLM0osTUFBTSxXQUFXLEdBQUcsR0FBRyxFQUFFLEdBQUcsTUFBTSxJQUFJLEtBQUssQ0FBQyw0Q0FBNEMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBUzdGLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxVQUFVO0lBSWhELFlBQTZCLFFBQTZDLEVBQW1CLFdBQWtDO1FBQzlILEtBQUssRUFBRSxDQUFDO1FBRG9CLGFBQVEsR0FBUixRQUFRLENBQXFDO1FBQW1CLGdCQUFXLEdBQVgsV0FBVyxDQUF1QjtRQUU5SCxJQUFJLENBQUMsT0FBTyxHQUFHLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxh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