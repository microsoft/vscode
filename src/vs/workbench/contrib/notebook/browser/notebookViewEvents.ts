/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FontInfo } from '../../../../editor/common/config/fontInfo.js';
import { NotebookCellTextModel } from '../common/model/notebookCellTextModel.js';
import { NotebookDocumentMetadata } from '../common/notebookCommon.js';

export interface NotebookLayoutInfo {
	width: number;
	height: number;
	scrollHeight: number;
	fontInfo: FontInfo;
	stickyHeight: number;
	listViewOffsetTop: number;
}

export interface CellViewModelStateChangeEvent {
	readonly metadataChanged?: boolean;
	readonly internalMetadataChanged?: boolean;
	readonly selectionChanged?: boolean;
	readonly focusModeChanged?: boolean;
	readonly editStateChanged?: boolean;
	readonly languageChanged?: boolean;
	readonly foldingStateChanged?: boolean;
	readonly contentChanged?: boolean;
	readonly outputIsHoveredChanged?: boolean;
	readonly outputIsFocusedChanged?: boolean;
	readonly cellIsHoveredChanged?: boolean;
	readonly cellLineNumberChanged?: boolean;
	readonly inputCollapsedChanged?: boolean;
	readonly outputCollapsedChanged?: boolean;
	readonly dragStateChanged?: boolean;
}

export interface NotebookLayoutChangeEvent {
	width?: boolean;
	height?: boolean;
	fontInfo?: boolean;
}

export enum NotebookViewEventType {
	LayoutChanged = 1,
	MetadataChanged = 2,
	CellStateChanged = 3
}

export class NotebookLayoutChangedEvent {
	public readonly type = NotebookViewEventType.LayoutChanged;

	constructor(readonly source: NotebookLayoutChangeEvent, readonly value: NotebookLayoutInfo) {

	}
}


export class NotebookMetadataChangedEvent {
	public readonly type = NotebookViewEventType.MetadataChanged;

	constructor(readonly source: NotebookDocumentMetadata) {

	}
}

export class NotebookCellStateChangedEvent {
	public readonly type = NotebookViewEventType.CellStateChanged;

	constructor(readonly source: CellViewModelStateChangeEvent, readonly cell: NotebookCellTextModel) {

	}
}

export type NotebookViewEvent = NotebookLayoutChangedEvent | NotebookMetadataChangedEvent | NotebookCellStateChangedEvent;
