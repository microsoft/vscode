/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as _ from 'vs/base/parts/tree/browser/tree';
import { IDragAndDropData } from 'vs/base/browser/dnd';

export class ElementsDragAndDropData implements IDragAndDropData {

	private elements: any[];

	constructor(elements: any[]) {
		this.elements = elements;
	}

	public update(dataTransfer: DataTransfer): void {
		// no-op
	}

	public getData(): any {
		return this.elements;
	}
}

export class ExternalElementsDragAndDropData implements IDragAndDropData {

	private elements: any[];

	constructor(elements: any[]) {
		this.elements = elements;
	}

	public update(dataTransfer: DataTransfer): void {
		// no-op
	}

	public getData(): any {
		return this.elements;
	}
}

export class DesktopDragAndDropData implements IDragAndDropData {

	private types: any[];
	private files: any[];

	constructor() {
		this.types = [];
		this.files = [];
	}

	public update(dataTransfer: DataTransfer): void {
		if (dataTransfer.types) {
			this.types = [];
			Array.prototype.push.apply(this.types, dataTransfer.types as any);
		}

		if (dataTransfer.files) {
			this.files = [];
			Array.prototype.push.apply(this.files, dataTransfer.files as any);

			this.files = this.files.filter(f => f.size || f.type);
		}
	}

	public getData(): any {
		return {
			types: this.types,
			files: this.files
		};
	}
}