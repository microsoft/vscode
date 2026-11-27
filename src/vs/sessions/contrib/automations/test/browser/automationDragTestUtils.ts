/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mock } from '../../../../../base/test/common/mock.js';

/**
 * A data transfer as Chromium exposes it during `dragenter` and `dragover`: its types and item kinds are readable,
 * but its files and data stay hidden until `drop`. A synthetic `DataTransfer` cannot simulate this on its own.
 */
export class ProtectedModeDataTransfer extends mock<DataTransfer>() {
	override dropEffect: DataTransfer['dropEffect'] = 'none';
	override readonly types: readonly string[];
	override readonly items: DataTransferItemList;
	override readonly files: FileList = new DataTransfer().files;

	constructor(source: DataTransfer) {
		super();
		this.types = source.types;
		this.items = source.items;
	}

	override getData(): string {
		return '';
	}
}

/** Creates a data transfer that carries the given files, as one dragged from the operating system does. */
export function fileDataTransfer(...files: File[]): DataTransfer {
	const dataTransfer = new DataTransfer();
	for (const file of files) {
		dataTransfer.items.add(file);
	}
	return dataTransfer;
}

/** Creates a drag event whose data transfer is the given one, which need not be a real `DataTransfer`. */
export function createDragEvent(type: string, dataTransfer: DataTransfer): DragEvent {
	const event = new DragEvent(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
	return event;
}
