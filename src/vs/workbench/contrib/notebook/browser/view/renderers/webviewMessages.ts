/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { RenderOutputType } from '../../notebookBrowser.js';
import type { PreloadOptions, RenderOptions } from './webviewPreloads.js';
import { NotebookCellMetadata } from '../../../common/notebookCommon.js';

interface BaseToWebviewMessage {
	readonly __vscode_notebook_message: true;
}

export interface WebviewInitialized extends BaseToWebviewMessage {
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

export interface IOutputInputFocusMessage extends BaseToWebviewMessage {
	readonly type: 'outputInputFocus';
	readonly inputFocused: boolean;
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
	readonly data: { top: number };
	readonly version: number;
}

export interface IFocusEditorMessage extends BaseToWebviewMessage {
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

export interface IClickedLinkMessage extends BaseToWebviewMessage {
	readonly type: 'clicked-link';
	readonly href: string;
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
	readonly requestId: string;
}

export interface ICodeBlockHighlightRequest {
	readonly id: string;
	readonly value: string;
	readonly lang: string;
}

export interface IRenderedMarkupMessage extends BaseToWebviewMessage {
	readonly type: 'renderedMarkup';
	readonly cellId: string;
	readonly html: string;
	readonly codeBlocks: ReadonlyArray<ICodeBlockHighlightRequest>;
}

export interface IRenderedCellOutputMessage extends BaseToWebviewMessage {
	readonly type: 'renderedCellOutput';
	readonly codeBlocks: ReadonlyArray<ICodeBlockHighlightRequest>;
}

export interface IClearMessage {
	readonly type: 'clear';
}

export interface OutputItemEntry {
	readonly mime: string;
	readonly valueBytes: Uint8Array;
	readonly appended?: { valueBytes: Uint8Array; previousVersion: number };
}

export type ICreationContent =
	| { readonly type: RenderOutputType.Html; readonly htmlContent: string }
	| {
		readonly type: RenderOutputType.Extension;
		readonly outputId: string;
		readonly metadata: unknown;
		readonly output: OutputItemEntry;
		readonly allOutputs: ReadonlyArray<{ readonly mime: string }>;
	};

export interface ICreationRequestMessage {
	readonly type: 'html';
	readonly content: ICreationContent;
	readonly cellId: string;
	readonly outputId: string;
	cellTop: number;
	outputOffset: number;
	readonly left: number;
	readonly requiredPreloads: readonly IControllerPreload[];
	readonly initiallyHidden?: boolean;
	readonly rendererId?: string | undefined;
	readonly executionId?: string | undefined;
	readonly createOnIdle: boolean;
}

export interface IContentWidgetTopRequest {
	readonly cellId: string;
	readonly outputId: string;
	readonly cellTop: number;
	readonly outputOffset: number;
	readonly forceDisplay: boolean;
}

export interface IMarkupCellScrollTops {
	readonly id: string;
	readonly top: number;
}

export interface IViewScrollTopRequestMessage {
	readonly type: 'view-scroll';
	readonly widgets: readonly IContentWidgetTopRequest[];
	readonly markupCells: readonly IMarkupCellScrollTops[];
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
	readonly content?: ICreationContent;
}

export interface ICopyImageMessage {
	readonly type: 'copyImage';
	readonly outputId: string;
	readonly altOutputId: string;
	readonly textAlternates?: { mimeType: string; content: string }[];
}

export interface IFocusOutputMessage {
	readonly type: 'focus-output';
	readonly cellOrOutputId: string;
	readonly alternateId?: string;
}

export interface IBlurOutputMessage {
	readonly type: 'blur-output';
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
	readonly resources: readonly IControllerPreload[];
}

export interface RendererMetadata {
	readonly id: string;
	readonly entrypoint: { readonly extends: string | undefined; readonly path: string };
	readonly mimeTypes: readonly string[];
	readonly messaging: boolean;
	readonly isBuiltin: boolean;
}

export interface StaticPreloadMetadata {
	readonly entrypoint: string;
}

export interface IUpdateRenderersMessage {
	readonly type: 'updateRenderers';
	readonly rendererData: readonly RendererMetadata[];
}

export interface IUpdateDecorationsMessage {
	readonly type: 'decorations' | 'markupDecorations';
	readonly cellId: string;
	readonly addedClassNames: readonly string[];
	readonly removedClassNames: readonly string[];
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
	readonly metadata: NotebookCellMetadata | undefined;
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
	metadata: NotebookCellMetadata;
}

export interface IInitializeMarkupCells {
	readonly type: 'initializeMarkup';
	readonly cells: readonly IMarkupCellInitialization[];
	readonly requestId: string;
}

export interface INotebookStylesMessage {
	readonly type: 'notebookStyles';
	readonly styles: {
		readonly [key: string]: string;
	};
}

export interface INotebookOptionsMessage {
	readonly type: 'notebookOptions';
	readonly options: PreloadOptions;
	readonly renderOptions: RenderOptions;
}

export interface ITokenizedCodeBlockMessage {
	readonly type: 'tokenizedCodeBlock';
	readonly codeBlockId: string;
	readonly html: string;
}

export interface ITokenizedStylesChangedMessage {
	readonly type: 'tokenizedStylesChanged';
	readonly css: string;
}

export interface IFindMessage {
	readonly type: 'find';
	readonly query: string;
	readonly options: { wholeWord?: boolean; caseSensitive?: boolean; includeMarkup: boolean; includeOutput: boolean; shouldGetSearchPreviewInfo: boolean; ownerID: string; findIds: string[] };
}


export interface IFindHighlightCurrentMessage {
	readonly type: 'findHighlightCurrent';
	readonly index: number;
	readonly ownerID: string;
}

export interface IFindUnHighlightCurrentMessage {
	readonly type: 'findUnHighlightCurrent';
	readonly index: number;
	readonly ownerID: string;
}

export interface IFindStopMessage {
	readonly type: 'findStop';
	readonly ownerID: string;
}

export interface ISearchPreviewInfo {
	line: string;
	range: {
		start: number;
		end: number;
	};
}

export interface IFindMatch {
	readonly type: 'preview' | 'output';
	readonly cellId: string;
	readonly id: string;
	readonly index: number;
	readonly searchPreviewInfo?: ISearchPreviewInfo;
}

export interface IDidFindMessage extends BaseToWebviewMessage {
	readonly type: 'didFind';
	readonly matches: IFindMatch[];
}

export interface IDidFindHighlightCurrentMessage extends BaseToWebviewMessage {
	readonly type: 'didFindHighlightCurrent';
	readonly offset: number;
}

export interface IOutputResizedMessage extends BaseToWebviewMessage {
	readonly type: 'outputResized';
	readonly cellId: string;
}

export interface IGetOutputItemMessage extends BaseToWebviewMessage {
	readonly type: 'getOutputItem';
	readonly requestId: number;
	readonly outputId: string;
	readonly mime: string;
}

export interface IReturnOutputItemMessage {
	readonly type: 'returnOutputItem';
	readonly requestId: number;
	readonly output: OutputItemEntry | undefined;
}

export interface ISelectOutputItemMessage {
	readonly type: 'select-output-contents';
	readonly cellOrOutputId: string;
}
export interface ISelectInputOutputItemMessage {
	readonly type: 'select-input-contents';
	readonly cellOrOutputId: string;
}

export interface ILogRendererDebugMessage extends BaseToWebviewMessage {
	readonly type: 'logRendererDebugMessage';
	readonly message: string;
	readonly data?: Record<string, string>;
}

export interface IPerformanceMessage extends BaseToWebviewMessage {
	readonly type: 'notebookPerformanceMessage';
	readonly executionId: string;
	readonly cellId: string;
	readonly duration: number;
	readonly rendererId: string;
	readonly outputSize?: number;
}


export type FromWebviewMessage = WebviewInitialized |
	IDimensionMessage |
	IMouseEnterMessage |
	IMouseLeaveMessage |
	IOutputFocusMessage |
	IOutputBlurMessage |
	IOutputInputFocusMessage |
	IScrollToRevealMessage |
	IWheelMessage |
	IScrollAckMessage |
	IFocusEditorMessage |
	ICustomKernelMessage |
	ICustomRendererMessage |
	IClickedDataUrlMessage |
	IClickMarkupCellMessage |
	IClickedLinkMessage |
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
	IRenderedCellOutputMessage |
	IDidFindMessage |
	IDidFindHighlightCurrentMessage |
	IOutputResizedMessage |
	IGetOutputItemMessage |
	ILogRendererDebugMessage |
	IPerformanceMessage;

export type ToWebviewMessage = IClearMessage |
	IFocusOutputMessage |
	IBlurOutputMessage |
	IAckOutputHeightMessage |
	ICreationRequestMessage |
	IViewScrollTopRequestMessage |
	IScrollRequestMessage |
	IClearOutputRequestMessage |
	IHideOutputMessage |
	IShowOutputMessage |
	ICopyImageMessage |
	IUpdateControllerPreloadsMessage |
	IUpdateRenderersMessage |
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
	ITokenizedCodeBlockMessage |
	ITokenizedStylesChangedMessage |
	IFindMessage |
	IFindHighlightCurrentMessage |
	IFindUnHighlightCurrentMessage |
	IFindStopMessage |
	IReturnOutputItemMessage |
	ISelectOutputItemMessage |
	ISelectInputOutputItemMessage;


export type AnyMessage = FromWebviewMessage | ToWebviewMessage;
