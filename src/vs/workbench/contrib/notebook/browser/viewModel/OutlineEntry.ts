/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { ICellViewModel } from '../notebookBrowser.js';
import { executingStateIcon } from '../notebookIcons.js';
import { CellKind } from '../../common/notebookCommon.js';
import { IRange } from '../../../../../editor/common/core/range.js';
import { SymbolKind, SymbolKinds } from '../../../../../editor/common/languages.js';

export interface IOutlineMarkerInfo {
	readonly count: number;
	readonly topSev: MarkerSeverity;
}

export class OutlineEntry {
	private _children: OutlineEntry[] = [];
	private _parent: OutlineEntry | undefined;
	private _markerInfo: IOutlineMarkerInfo | undefined;

	get icon(): ThemeIcon {
		if (this.symbolKind) {
			return SymbolKinds.toIcon(this.symbolKind);
		}
		return this.isExecuting && this.isPaused ? executingStateIcon :
			this.isExecuting ? ThemeIcon.modify(executingStateIcon, 'spin') :
				this.cell.cellKind === CellKind.Markup ? Codicon.markdown : Codicon.code;
	}

	constructor(
		readonly index: number,
		readonly level: number,
		readonly cell: ICellViewModel,
		readonly label: string,
		readonly isExecuting: boolean,
		readonly isPaused: boolean,
		readonly range?: IRange,
		readonly symbolKind?: SymbolKind,
	) { }

	addChild(entry: OutlineEntry) {
		this._children.push(entry);
		entry._parent = this;
	}

	get parent(): OutlineEntry | undefined {
		return this._parent;
	}

	get children(): Iterable<OutlineEntry> {
		return this._children;
	}

	get markerInfo(): IOutlineMarkerInfo | undefined {
		return this._markerInfo;
	}

	get position() {
		if (this.range) {
			return { startLineNumber: this.range.startLineNumber, startColumn: this.range.startColumn };
		}
		return undefined;
	}

	updateMarkers(markerService: IMarkerService): void {
		if (this.cell.cellKind === CellKind.Code) {
			// a code cell can have marker
			const marker = markerService.read({ resource: this.cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
			if (marker.length === 0) {
				this._markerInfo = undefined;
			} else {
				const topSev = marker.find(a => a.severity === MarkerSeverity.Error)?.severity ?? MarkerSeverity.Warning;
				this._markerInfo = { topSev, count: marker.length };
			}
		} else {
			// a markdown cell can inherit markers from its children
			let topChild: MarkerSeverity | undefined;
			for (const child of this.children) {
				child.updateMarkers(markerService);
				if (child.markerInfo) {
					topChild = !topChild ? child.markerInfo.topSev : Math.max(child.markerInfo.topSev, topChild);
				}
			}
			this._markerInfo = topChild && { topSev: topChild, count: 0 };
		}
	}

	clearMarkers(): void {
		this._markerInfo = undefined;
		for (const child of this.children) {
			child.clearMarkers();
		}
	}

	find(cell: ICellViewModel, parents: OutlineEntry[]): OutlineEntry | undefined {
		if (cell.id === this.cell.id) {
			return this;
		}
		parents.push(this);
		for (const child of this.children) {
			const result = child.find(cell, parents);
			if (result) {
				return result;
			}
		}
		parents.pop();
		return undefined;
	}

	asFlatList(bucket: OutlineEntry[]): void {
		bucket.push(this);
		for (const child of this.children) {
			child.asFlatList(bucket);
		}
	}
}
