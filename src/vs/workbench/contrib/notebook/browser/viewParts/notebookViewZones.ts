/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IsDevelopmentContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { getNotebookEditorFromEditorPane, INotebookViewCellsUpdateEvent, INotebookViewZone, INotebookViewZoneChangeAccessor } from '../notebookBrowser.js';
import { NotebookCellListView } from '../view/notebookCellListView.js';
import { ICoordinatesConverter } from '../view/notebookRenderingCommon.js';
import { CellViewModel } from '../viewModel/notebookViewModelImpl.js';

const invalidFunc = () => { throw new Error(`Invalid notebook view zone change accessor`); };

interface IZoneWidget {
	whitespaceId: string;
	isInHiddenArea: boolean;
	zone: INotebookViewZone;
	domNode: FastDomNode<HTMLElement>;
}

export class NotebookViewZones extends Disposable {
	private _zones: { [key: string]: IZoneWidget };
	public domNode: FastDomNode<HTMLElement>;

	constructor(private readonly listView: NotebookCellListView<CellViewModel>, private readonly coordinator: ICoordinatesConverter) {
		super();
		this.domNode = createFastDomNode(document.createElement('div'));
		this.domNode.setClassName('view-zones');
		this.domNode.setPosition('absolute');
		this.domNode.setAttribute('role', 'presentation');
		this.domNode.setAttribute('aria-hidden', 'true');
		this.domNode.setWidth('100%');
		this._zones = {};

		this.listView.containerDomNode.appendChild(this.domNode.domNode);
	}

	changeViewZones(callback: (changeAccessor: INotebookViewZoneChangeAccessor) => void): boolean {
		let zonesHaveChanged = false;
		const changeAccessor: INotebookViewZoneChangeAccessor = {
			addZone: (zone: INotebookViewZone): string => {
				zonesHaveChanged = true;
				return this._addZone(zone);
			},
			removeZone: (id: string): void => {
				zonesHaveChanged = true;
				// TODO: validate if zones have changed layout
				this._removeZone(id);
			},
			layoutZone: (id: string): void => {
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

	getViewZoneLayoutInfo(viewZoneId: string): { height: number; top: number } | null {
		const zoneWidget = this._zones[viewZoneId];
		if (!zoneWidget) {
			return null;
		}
		const top = this.listView.getWhitespacePosition(zoneWidget.whitespaceId);
		const height = zoneWidget.zone.heightInPx;
		return { height: height, top: top };
	}

	onCellsChanged(e: INotebookViewCellsUpdateEvent): void {
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
				} else if (cellBeforeWhitespaceIndex >= toIndex) {
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

	private _updateWhitespace(zone: IZoneWidget) {
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

	private _addZone(zone: INotebookViewZone): string {
		const viewPosition = this.coordinator.convertModelIndexToViewIndex(zone.afterModelPosition);
		const whitespaceId = this.listView.insertWhitespace(viewPosition, zone.heightInPx);
		const isInHiddenArea = this._isInHiddenRanges(zone);
		const myZone: IZoneWidget = {
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

	private _removeZone(id: string): void {
		this.listView.removeWhitespace(id);
		const zoneWidget = this._zones[id];
		if (zoneWidget) {
			// safely remove the dom node from its parent
			try {
				this.domNode.removeChild(zoneWidget.domNode);
			} catch {
				// ignore the error
			}
		}

		delete this._zones[id];
	}

	private _layoutZone(id: string): void {
		const zoneWidget = this._zones[id];
		if (!zoneWidget) {
			return;
		}

		this._updateWhitespace(this._zones[id]);

		const isInHiddenArea = this._isInHiddenRanges(zoneWidget.zone);

		if (isInHiddenArea) {
			zoneWidget.domNode.setDisplay('none');
		} else {
			const top = this.listView.getWhitespacePosition(zoneWidget.whitespaceId);
			zoneWidget.domNode.setTop(top);
			zoneWidget.domNode.setDisplay('block');
			zoneWidget.domNode.setHeight(zoneWidget.zone.heightInPx);
		}
	}

	private _isInHiddenRanges(zone: INotebookViewZone) {
		// The view zone is between two cells (zone.afterModelPosition - 1, zone.afterModelPosition)
		const afterIndex = zone.afterModelPosition;

		// In notebook, the first cell (markdown cell) in a folding range is always visible, so we need to check the cell after the notebook view zone
		return !this.coordinator.modelIndexIsVisible(afterIndex);

	}

	override dispose(): void {
		super.dispose();
		this._zones = {};
	}
}

function safeInvoke1Arg(func: Function, arg1: unknown): void {
	try {
		func(arg1);
	} catch (e) {
		onUnexpectedError(e);
	}
}

class ToggleNotebookViewZoneDeveloperAction extends Action2 {
	static viewZoneIds: string[] = [];
	constructor() {
		super({
			id: 'notebook.developer.addViewZones',
			title: localize2('workbench.notebook.developer.addViewZones', "Toggle Notebook View Zones"),
			category: Categories.Developer,
			precondition: IsDevelopmentContext,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
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
		} else {
			editor.changeViewZones(accessor => {
				const cells = editor.getCellsInRange();
				if (cells.length === 0) {
					return;
				}

				const viewZoneIds: string[] = [];
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
