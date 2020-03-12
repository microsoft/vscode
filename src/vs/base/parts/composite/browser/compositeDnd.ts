/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from 'vs/base/browser/dnd';

export class DraggedCompositeIdentifier {
	constructor(private _compositeId: string) { }

	get id(): string {
		return this._compositeId;
	}
}

export class DraggedViewIdentifier {
	constructor(private _viewId: string) { }

	get id(): string {
		return this._viewId;
	}
}

export interface IDraggedCompositeData {
	eventData: DragEvent;
	dragAndDropData: CompositeDragAndDropData;
}

export class CompositeDragAndDropData implements IDragAndDropData {
	constructor(private type: 'view' | 'composite', private id: string) { }
	update(dataTransfer: DataTransfer): void {
		// no-op
	}
	getData(): {
		type: 'view' | 'composite';
		id: string;
	} {
		return { type: this.type, id: this.id };
	}
}

export interface ICompositeDragAndDrop {
	drop(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent): void;
	onDragOver(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent): boolean;
	onDragEnter(data: IDragAndDropData, target: string | undefined, originalEvent: DragEvent): boolean;
}

export interface ICompositeDragAndDropObserverCallbacks {
	onDragEnter?: (e: IDraggedCompositeData) => void;
	onDragLeave?: (e: IDraggedCompositeData) => void;
	onDrop?: (e: IDraggedCompositeData) => void;
	onDragOver?: (e: IDraggedCompositeData) => void;
	onDragStart?: (e: IDraggedCompositeData) => void;
	onDragEnd?: (e: IDraggedCompositeData) => void;
}
