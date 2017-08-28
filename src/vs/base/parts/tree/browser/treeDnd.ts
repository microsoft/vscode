/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import _ = require('vs/base/parts/tree/browser/tree');
import Mouse = require('vs/base/browser/mouseEvent');
import { DefaultDragAndDrop } from 'vs/base/parts/tree/browser/treeDefaults';
import URI from 'vs/base/common/uri';
import { basename } from 'vs/base/common/paths';
import { getPathLabel } from 'vs/base/common/labels';

export class ElementsDragAndDropData implements _.IDragAndDropData {

	private elements: any[];

	constructor(elements: any[]) {
		this.elements = elements;
	}

	public update(event: Mouse.DragMouseEvent): void {
		// no-op
	}

	public getData(): any {
		return this.elements;
	}
}

export class ExternalElementsDragAndDropData implements _.IDragAndDropData {

	private elements: any[];

	constructor(elements: any[]) {
		this.elements = elements;
	}

	public update(event: Mouse.DragMouseEvent): void {
		// no-op
	}

	public getData(): any {
		return this.elements;
	}
}

export class DesktopDragAndDropData implements _.IDragAndDropData {

	private types: any[];
	private files: any[];

	constructor() {
		this.types = [];
		this.files = [];
	}

	public update(event: Mouse.DragMouseEvent): void {
		if (event.dataTransfer.types) {
			this.types = [];
			Array.prototype.push.apply(this.types, event.dataTransfer.types);
		}

		if (event.dataTransfer.files) {
			this.files = [];
			Array.prototype.push.apply(this.files, event.dataTransfer.files);

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

export class SimpleFileResourceDragAndDrop extends DefaultDragAndDrop {

	constructor(private toResource: (obj: any) => URI) {
		super();
	}

	public getDragURI(tree: _.ITree, obj: any): string {
		const resource = this.toResource(obj);
		if (resource) {
			return resource.toString();
		}

		return void 0;
	}

	public getDragLabel(tree: _.ITree, elements: any[]): string {
		if (elements.length > 1) {
			return String(elements.length);
		}

		const resource = this.toResource(elements[0]);
		if (resource) {
			return basename(resource.fsPath);
		}

		return void 0;
	}

	public onDragStart(tree: _.ITree, data: _.IDragAndDropData, originalEvent: Mouse.DragMouseEvent): void {
		const sources: object[] = data.getData();

		let source: object = null;
		if (sources.length > 0) {
			source = sources[0];
		}

		// Apply some datatransfer types to allow for dragging the element outside of the application
		const resource = this.toResource(source);
		if (resource) {
			originalEvent.dataTransfer.setData('text/plain', getPathLabel(resource));
		}
	}
}