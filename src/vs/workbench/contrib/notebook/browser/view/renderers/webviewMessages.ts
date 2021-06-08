/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import type { PreloadOptions } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads';

interface BaseToWebviewMessage {
	readonly __vscode_notebook_message: true;
}

export interface WebviewIntialized extends BaseToWebviewMessage {
	type: 'initialized';
}

export interface DimensionUpdate {
	id: string;
	init?: boolean;
	height: number;
	isOutput?: boolean;
}

export interface IDimensionMessage extends BaseToWebviewMessage {
	type: 'dimension';
	updates: readonly DimensionUpdate[];
}

export interface IMouseEnterMessage extends BaseToWebviewMessage {
	type: 'mouseenter';
	id: string;
}

export interface IMouseLeaveMessage extends BaseToWebviewMessage {
	type: 'mouseleave';
	id: string;
}

export interface IOutputFocusMessage extends BaseToWebviewMessage {
	type: 'outputFocus';
	id: string;
}

export interface IOutputBlurMessage extends BaseToWebviewMessage {
	type: 'outputBlur';
	id: string;
}

export interface IWheelMessage extends BaseToWebviewMessage {
	type: 'did-scroll-wheel';
	payload: any;
}

export interface IScrollAckMessage extends BaseToWebviewMessage {
	type: 'scroll-ack';
	data: { top: number; };
	version: number;
}

export interface IBlurOutputMessage extends BaseToWebviewMessage {
	type: 'focus-editor';
	id: string;
	focusNext?: boolean;
}

export interface IClickedDataUrlMessage extends BaseToWebviewMessage {
	type: 'clicked-data-url';
	data: string | ArrayBuffer | null;
	downloadName?: string;
}

export interface IClickMarkdownPreviewMessage extends BaseToWebviewMessage {
	readonly type: 'clickMarkdownPreview';
	readonly cellId: string;
	readonly ctrlKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
}

export interface IContextMenuMarkdownPreviewMessage extends BaseToWebviewMessage {
	readonly type: 'contextMenuMarkdownPreview';
	readonly cellId: string;
	readonly clientX: number;
	readonly clientY: number;
}

export interface IMouseEnterMarkdownPreviewMessage extends BaseToWebviewMessage {
	type: 'mouseEnterMarkdownPreview';
	cellId: string;
}

export interface IMouseLeaveMarkdownPreviewMessage extends BaseToWebviewMessage {
	type: 'mouseLeaveMarkdownPreview';
	cellId: string;
}

export interface IToggleMarkdownPreviewMessage extends BaseToWebviewMessage {
	type: 'toggleMarkdownPreview';
	cellId: string;
}

export interface ICellDragStartMessage extends BaseToWebviewMessage {
	type: 'cell-drag-start';
	readonly cellId: string;
	readonly dragOffsetY: number;
}

export interface ICellDragMessage extends BaseToWebviewMessage {
	type: 'cell-drag';
	readonly cellId: string;
	readonly dragOffsetY: number;
}

export interface ICellDropMessage extends BaseToWebviewMessage {
	readonly type: 'cell-drop';
	readonly cellId: string;
	readonly ctrlKey: boolean;
	readonly altKey: boolean;
	readonly dragOffsetY: number;
}

export interface ICellDragEndMessage extends BaseToWebviewMessage {
	readonly type: 'cell-drag-end';
	readonly cellId: string;
}

export interface IInitializedMarkdownPreviewMessage extends BaseToWebviewMessage {
	readonly type: 'initializedMarkdownPreview';
}

export interface ITelemetryFoundRenderedMarkdownMath extends BaseToWebviewMessage {
	readonly type: 'telemetryFoundRenderedMarkdownMath';
}

export interface ITelemetryFoundUnrenderedMarkdownMath extends BaseToWebviewMessage {
	readonly type: 'telemetryFoundUnrenderedMarkdownMath';
	readonly latexDirective: string;
}

export interface IClearMessage {
	type: 'clear';
}

export interface IOutputRequestMetadata {
	/**
	 * Additional attributes of a cell metadata.
	 */
	custom?: { [key: string]: unknown; };
}

export interface IOutputRequestDto {
	/**
	 * { mime_type: value }
	 */
	data: { [key: string]: unknown; };

	metadata?: IOutputRequestMetadata;
	outputId: string;
}

export interface ICreationRequestMessage {
	type: 'html';
	content: { type: RenderOutputType.Html; htmlContent: string; } |
	{ type: RenderOutputType.Extension; outputId: string; valueBytes: Uint8Array; metadata: unknown; metadata2: unknown; mimeType: string; };
	cellId: string;
	outputId: string;
	cellTop: number;
	outputOffset: number;
	left: number;
	requiredPreloads: ReadonlyArray<IControllerPreload>;
	readonly initiallyHidden?: boolean;
	rendererId?: string | undefined;
}

export interface IContentWidgetTopRequest {
	outputId: string;
	cellTop: number;
	outputOffset: number;
	forceDisplay: boolean;
}

export interface IViewScrollTopRequestMessage {
	type: 'view-scroll';
	widgets: IContentWidgetTopRequest[];
	markdownPreviews: { id: string; top: number; }[];
}

export interface IScrollRequestMessage {
	type: 'scroll';
	id: string;
	top: number;
	widgetTop?: number;
	version: number;
}

export interface IClearOutputRequestMessage {
	type: 'clearOutput';
	cellId: string;
	outputId: string;
	cellUri: string;
	rendererId: string | undefined;
}

export interface IHideOutputMessage {
	type: 'hideOutput';
	outputId: string;
	cellId: string;
}

export interface IShowOutputMessage {
	type: 'showOutput';
	cellId: string;
	outputId: string;
	cellTop: number;
	outputOffset: number;
}

export interface IFocusOutputMessage {
	type: 'focus-output';
	cellId: string;
}

export interface IAckOutputHeightMessage {
	type: 'ack-dimension';
	cellId: string;
	outputId: string;
	height: number;
}


export interface IControllerPreload {
	originalUri: string;
	uri: string;
}

export interface IUpdateControllerPreloadsMessage {
	type: 'preload';
	resources: IControllerPreload[];
}

export interface IUpdateDecorationsMessage {
	type: 'decorations';
	cellId: string;
	addedClassNames: string[];
	removedClassNames: string[];
}

export interface ICustomKernelMessage extends BaseToWebviewMessage {
	type: 'customKernelMessage';
	message: unknown;
}

export interface ICustomRendererMessage extends BaseToWebviewMessage {
	type: 'customRendererMessage';
	rendererId: string;
	message: unknown;
}

export interface ICreateMarkupCellMessage {
	type: 'createMarkupCell';
	cell: IMarkdownCellInitialization;
}

export interface IDeleteMarkupCellMessage {
	type: 'deleteMarkupCell';
	ids: readonly string[];
}

export interface IHideMarkupCellMessage {
	type: 'hideMarkupCells';
	ids: readonly string[];
}

export interface IUnhideMarkupCellMessage {
	type: 'unhideMarkupCells';
	ids: readonly string[];
}

export interface IShowMarkupCellMessage {
	type: 'showMarkupCell';
	id: string;
	handle: number;
	content: string | undefined;
	top: number;
}

export interface IUpdateSelectedMarkupCellsMessage {
	readonly type: 'updateSelectedMarkupCells';
	readonly selectedCellIds: readonly string[];
}

export interface IMarkdownCellInitialization {
	cellId: string;
	cellHandle: number;
	content: string;
	offset: number;
	visible: boolean;
}

export interface IInitializeMarkupCells {
	type: 'initializeMarkup';
	cells: ReadonlyArray<IMarkdownCellInitialization>;
}

export interface INotebookStylesMessage {
	type: 'notebookStyles';
	styles: {
		[key: string]: string;
	};
}

export interface INotebookOptionsMessage {
	type: 'notebookOptions';
	options: PreloadOptions;
}

export type FromWebviewMessage = WebviewIntialized |
	IDimensionMessage |
	IMouseEnterMessage |
	IMouseLeaveMessage |
	IOutputFocusMessage |
	IOutputBlurMessage |
	IWheelMessage |
	IScrollAckMessage |
	IBlurOutputMessage |
	ICustomKernelMessage |
	ICustomRendererMessage |
	IClickedDataUrlMessage |
	IClickMarkdownPreviewMessage |
	IContextMenuMarkdownPreviewMessage |
	IMouseEnterMarkdownPreviewMessage |
	IMouseLeaveMarkdownPreviewMessage |
	IToggleMarkdownPreviewMessage |
	ICellDragStartMessage |
	ICellDragMessage |
	ICellDropMessage |
	ICellDragEndMessage |
	IInitializedMarkdownPreviewMessage |
	ITelemetryFoundRenderedMarkdownMath |
	ITelemetryFoundUnrenderedMarkdownMath;

export type ToWebviewMessage = IClearMessage |
	IFocusOutputMessage |
	IAckOutputHeightMessage |
	ICreationRequestMessage |
	IViewScrollTopRequestMessage |
	IScrollRequestMessage |
	IClearOutputRequestMessage |
	IHideOutputMessage |
	IShowOutputMessage |
	IUpdateControllerPreloadsMessage |
	IUpdateDecorationsMessage |
	ICustomKernelMessage |
	ICustomRendererMessage |
	ICreateMarkupCellMessage |
	IDeleteMarkupCellMessage |
	IShowMarkupCellMessage |
	IHideMarkupCellMessage |
	IUnhideMarkupCellMessage |
	IUpdateSelectedMarkupCellsMessage |
	IInitializeMarkupCells |
	INotebookStylesMessage |
	INotebookOptionsMessage;

export type AnyMessage = FromWebviewMessage | ToWebviewMessage;
