/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { INotebookViewCellsUpdateEvent, INotebookViewZone, INotebookViewZoneChangeAccessor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookCellListView } from 'vs/workbench/contrib/notebook/browser/view/notebookCellListView';
import { ICoordinatesConverter } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { CellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';

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
		this._zones = {};

		this.listView.containerDomNode.appendChild(this.domNode.domNode);
	}

	changeViewZones(callback: (changeAccessor: INotebookViewZoneChangeAccessor) => void): void {
		const changeAccessor: INotebookViewZoneChangeAccessor = {
			addZone: (zone: INotebookViewZone): string => {
				return this._addZone(zone);
			},
			removeZone: (id: string): void => {
				this._removeZone(id);
			},
			layoutZone: (id: string): void => {
				this._layoutZone(id);
			}
		};

		safeInvoke1Arg(callback, changeAccessor);
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
		const whitespaceId = this.listView.insertWhitespace(zone.afterModelPosition, zone.heightInPx);
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
		delete this._zones[id];
	}

	private _layoutZone(id: string): void {
		const zoneWidget = this._zones[id];
		if (!zoneWidget) {
			return;
		}

		const isInHiddenArea = this._isInHiddenRanges(zoneWidget.zone);

		if (isInHiddenArea) {
			zoneWidget.domNode.setDisplay('none');
		} else {
			const afterPosition = zoneWidget.zone.afterModelPosition;
			const index = afterPosition - 1;
			const viewIndex = this.coordinator.convertModelIndexToViewIndex(index);
			const top = this.listView.elementTop(viewIndex);
			const height = this.listView.elementHeight(viewIndex);
			zoneWidget.domNode.setTop(top + height);
			zoneWidget.domNode.setDisplay('block');
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

function safeInvoke1Arg(func: Function, arg1: any): any {
	try {
		return func(arg1);
	} catch (e) {
		onUnexpectedError(e);
	}
}
