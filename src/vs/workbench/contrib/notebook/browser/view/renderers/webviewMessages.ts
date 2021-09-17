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
	readonly type: 'initialized';
}

export interface DimensionUpdate {
	readonly id: string;
	readonly init?: boolean;
	readonly height: number;
	readonly isOutput?: boolean;
}

export interface IDimensionMessage extends BaseToWebviewMessage {
	readonly type: 'dimension';
	readonly updates: readonly DimensionUpdate[];
}

export interface IMouseEnterMessage extends BaseToWebviewMessage {
	readonly type: 'mouseenter';
	readonly id: string;
}

export interface IMouseLeaveMessage extends BaseToWebviewMessage {
	readonly type: 'mouseleave';
	readonly id: string;
}

export interface IOutputFocusMessage extends BaseToWebviewMessage {
	readonly type: 'outputFocus';
	readonly id: string;
}

export interface IOutputBlurMessage extends BaseToWebviewMessage {
	readonly type: 'outputBlur';
	readonly id: string;
}

export interface IScrollToRevealMessage extends BaseToWebviewMessage {
	readonly type: 'scroll-to-reveal';
	readonly scrollTop: number;
}

export interface IWheelMessage extends BaseToWebviewMessage {
	readonly type: 'did-scroll-wheel';
	readonly payload: any;
}

export interface IScrollAckMessage extends BaseToWebviewMessage {
	readonly type: 'scroll-ack';
	readonly data: { top: number; };
	readonly version: number;
}

export interface IBlurOutputMessage extends BaseToWebviewMessage {
	readonly type: 'focus-editor';
	readonly cellId: string;
	readonly focusNext?: boolean;
}

export interface IClickedDataUrlMessage extends BaseToWebviewMessage {
	readonly type: 'clicked-data-url';
	readonly data: string | ArrayBuffer | null;
	readonly downloadName?: string;
}

export interface IClickMarkupCellMessage extends BaseToWebviewMessage {
	readonly type: 'clickMarkupCell';
	readonly cellId: string;
	readonly ctrlKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
}

export interface IContextMenuMarkupCellMessage extends BaseToWebviewMessage {
	readonly type: 'contextMenuMarkupCell';
	readonly cellId: string;
	readonly clientX: number;
	readonly clientY: number;
}

export interface IMouseEnterMarkupCellMessage extends BaseToWebviewMessage {
	readonly type: 'mouseEnterMarkupCell';
	readonly cellId: string;
}

export interface IMouseLeaveMarkupCellMessage extends BaseToWebviewMessage {
	readonly type: 'mouseLeaveMarkupCell';
	readonly cellId: string;
}

export interface IToggleMarkupPreviewMessage extends BaseToWebviewMessage {
	readonly type: 'toggleMarkupPreview';
	readonly cellId: string;
}

export interface ICellDragStartMessage extends BaseToWebviewMessage {
	readonly type: 'cell-drag-start';
	readonly cellId: string;
	readonly dragOffsetY: number;
}

export interface ICellDragMessage extends BaseToWebviewMessage {
	readonly type: 'cell-drag';
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

export interface IInitializedMarkupMessage extends BaseToWebviewMessage {
	readonly type: 'initializedMarkup';
}

export interface IRenderedMarkupMessage extends BaseToWebviewMessage {
	readonly type: 'renderedMarkup';
	readonly cellId: string;
	readonly html: string;
}

export interface ITelemetryFoundRenderedMarkdownMath extends BaseToWebviewMessage {
	readonly type: 'telemetryFoundRenderedMarkdownMath';
}

export interface ITelemetryFoundUnrenderedMarkdownMath extends BaseToWebviewMessage {
	readonly type: 'telemetryFoundUnrenderedMarkdownMath';
	readonly latexDirective: string;
}

export interface IClearMessage {
	readonly type: 'clear';
}

export interface IOutputRequestMetadata {
	/**
	 * Additional attributes of a cell metadata.
	 */
	readonly custom?: { [key: string]: unknown; };
}

export interface IOutputRequestDto {
	/**
	 * { mime_type: value }
	 */
	readonly data: { [key: string]: unknown; };

	readonly metadata?: IOutputRequestMetadata;
	readonly outputId: string;
}

export type ICreationContent =
	| { type: RenderOutputType.Html; htmlContent: string; }
	| { type: RenderOutputType.Extension; outputId: string; valueBytes: Uint8Array; metadata: unknown; mimeType: string; };

export interface ICreationRequestMessage {
	readonly type: 'html';
	readonly content: ICreationContent;
	readonly cellId: string;
	readonly outputId: string;
	cellTop: number;
	outputOffset: number;
	readonly left: number;
	readonly requiredPreloads: ReadonlyArray<IControllerPreload>;
	readonly initiallyHidden?: boolean;
	readonly rendererId?: string | undefined;
}

export interface IContentWidgetTopRequest {
	readonly cellId: string;
	readonly outputId: string;
	readonly cellTop: number;
	readonly outputOffset: number;
	readonly forceDisplay: boolean;
}

export interface IViewScrollTopRequestMessage {
	readonly type: 'view-scroll';
	readonly widgets: IContentWidgetTopRequest[];
	readonly markupCells: { id: string; top: number; }[];
}

export interface IScrollRequestMessage {
	readonly type: 'scroll';
	readonly id: string;
	readonly top: number;
	readonly widgetTop?: number;
	readonly version: number;
}

export interface IClearOutputRequestMessage {
	readonly type: 'clearOutput';
	readonly cellId: string;
	readonly outputId: string;
	readonly cellUri: string;
	readonly rendererId: string | undefined;
}

export interface IHideOutputMessage {
	readonly type: 'hideOutput';
	readonly outputId: string;
	readonly cellId: string;
}

export interface IShowOutputMessage {
	readonly type: 'showOutput';
	readonly cellId: string;
	readonly outputId: string;
	readonly cellTop: number;
	readonly outputOffset: number;
}

export interface IFocusOutputMessage {
	readonly type: 'focus-output';
	readonly cellId: string;
}

export interface IAckOutputHeight {
	readonly cellId: string;
	readonly outputId: string;
	readonly height: number;
}

export interface IAckOutputHeightMessage {
	readonly type: 'ack-dimension';
	readonly updates: readonly IAckOutputHeight[];
}

export interface IControllerPreload {
	readonly originalUri: string;
	readonly uri: string;
}

export interface IUpdateControllerPreloadsMessage {
	readonly type: 'preload';
	readonly resources: IControllerPreload[];
}

export interface IUpdateDecorationsMessage {
	readonly type: 'decorations';
	readonly cellId: string;
	readonly addedClassNames: string[];
	readonly removedClassNames: string[];
}

export interface ICustomKernelMessage extends BaseToWebviewMessage {
	readonly type: 'customKernelMessage';
	readonly message: unknown;
}

export interface ICustomRendererMessage extends BaseToWebviewMessage {
	readonly type: 'customRendererMessage';
	readonly rendererId: string;
	readonly message: unknown;
}

export interface ICreateMarkupCellMessage {
	readonly type: 'createMarkupCell';
	readonly cell: IMarkupCellInitialization;
}

export interface IDeleteMarkupCellMessage {
	readonly type: 'deleteMarkupCell';
	readonly ids: readonly string[];
}

export interface IHideMarkupCellMessage {
	readonly type: 'hideMarkupCells';
	readonly ids: readonly string[];
}

export interface IUnhideMarkupCellMessage {
	readonly type: 'unhideMarkupCells';
	readonly ids: readonly string[];
}

export interface IShowMarkupCellMessage {
	readonly type: 'showMarkupCell';
	readonly id: string;
	readonly handle: number;
	readonly content: string | undefined;
	readonly top: number;
}

export interface IUpdateSelectedMarkupCellsMessage {
	readonly type: 'updateSelectedMarkupCells';
	readonly selectedCellIds: readonly string[];
}

export interface IMarkupCellInitialization {
	mime: string;
	cellId: string;
	cellHandle: number;
	content: string;
	offset: number;
	visible: boolean;
}

export interface IInitializeMarkupCells {
	readonly type: 'initializeMarkup';
	readonly cells: ReadonlyArray<IMarkupCellInitialization>;
}

export interface INotebookStylesMessage {
	readonly type: 'notebookStyles';
	readonly styles: {
		[key: string]: string;
	};
}

export interface INotebookOptionsMessage {
	readonly type: 'notebookOptions';
	readonly options: PreloadOptions;
}

export interface INotebookUpdateWorkspaceTrust {
	readonly type: 'updateWorkspaceTrust';
	readonly isTrusted: boolean;
}

export type FromWebviewMessage = WebviewIntialized |
	IDimensionMessage |
	IMouseEnterMessage |
	IMouseLeaveMessage |
	IOutputFocusMessage |
	IOutputBlurMessage |
	IScrollToRevealMessage |
	IWheelMessage |
	IScrollAckMessage |
	IBlurOutputMessage |
	ICustomKernelMessage |
	ICustomRendererMessage |
	IClickedDataUrlMessage |
	IClickMarkupCellMessage |
	IContextMenuMarkupCellMessage |
	IMouseEnterMarkupCellMessage |
	IMouseLeaveMarkupCellMessage |
	IToggleMarkupPreviewMessage |
	ICellDragStartMessage |
	ICellDragMessage |
	ICellDropMessage |
	ICellDragEndMessage |
	IInitializedMarkupMessage |
	IRenderedMarkupMessage |
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
	INotebookOptionsMessage |
	INotebookUpdateWorkspaceTrust;

export type AnyMessage = FromWebviewMessage | ToWebviewMessage;
