/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDragAndDropData } from 'vs/base/browser/dnd';

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
