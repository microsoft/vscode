/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as osPath from 'vs/base/common/path';
import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { coalesce } from 'vs/base/common/arrays';
import { DeferredPromise, runWhenIdle } from 'vs/base/common/async';
import { decodeBase64 } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { getExtensionForMimeType } from 'vs/base/common/mime';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { equals } from 'vs/base/common/objects';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { dirname, extname, isEqual, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { generateTokensCSSForColorMap } from 'vs/editor/common/languages/supports/tokenization';
import { tokenizeToString } from 'vs/editor/common/languages/textToHtmlTokenizer';
import * as nls from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService, matchesScheme, matchesSomeScheme } from 'vs/platform/opener/common/opener';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { editorFindMatch, editorFindMatchHighlight } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { CellEditState, ICellOutputViewModel, ICellViewModel, ICommonCellInfo, IDisplayOutputLayoutUpdateRequest, IDisplayOutputViewModel, IFocusNotebookCellOptions, IGenericCellViewModel, IInsetRenderOutput, INotebookEditorCreationOptions, INotebookWebviewMessage, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NOTEBOOK_WEBVIEW_BOUNDARY } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { preloadsScriptStr } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads';
import { transformWebviewThemeVars } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewThemeMapping';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellUri, ICellOutput, INotebookRendererInfo, RendererMessagingSpec } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IScopedRendererMessaging } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IWebviewElement, IWebviewService, WebviewContentPurpose, WebviewOriginStore } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewWindowDragMonitor } from 'vs/workbench/contrib/webview/browser/webviewWindowDragMonitor';
import { asWebviewUri, webviewGenericCspSource } from 'vs/workbench/contrib/webview/common/webview';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { FromWebviewMessage, IAckOutputHeight, IClickedDataUrlMessage, ICodeBlockHighlightRequest, IContentWidgetTopRequest, IControllerPreload, ICreationContent, ICreationRequestMessage, IFindMatch, IMarkupCellInitialization, RendererMetadata, StaticPreloadMetadata, ToWebviewMessage } from './webviewMessages';
import { IPathService } from 'vs/workbench/services/path/common/pathService';
import { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { INotebookLoggingService } from 'vs/workbench/contrib/notebook/common/notebookLoggingService';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WorkbenchActionExecutedClassification, WorkbenchActionExecutedEvent } from 'vs/base/common/actions';

const LINE_COLUMN_REGEX = /:([\d]+)(?::([\d]+))?$/;
const LineQueryRegex = /line=(\d+)$/;


export interface ICachedInset<K extends ICommonCellInfo> {
	outputId: string;
	versionId: number;
	cellInfo: K;
	renderer?: INotebookRendererInfo;
	cachedCreation: ICreationRequestMessage;
	initialized?: boolean;
}

export interface IResolvedBackLayerWebview {
	webview: IWebviewElement;
}

/**
 * Notebook Editor Delegate for back layer webview
 */
export interface INotebookDelegateForWebview {
	readonly creationOptions: INotebookEditorCreationOptions;
	getCellById(cellId: string): IGenericCellViewModel | undefined;
	focusNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output', options?: IFocusNotebookCellOptions): Promise<void>;
	toggleNotebookCellSelection(cell: IGenericCellViewModel, selectFromPrevious: boolean): void;
	getCellByInfo(cellInfo: ICommonCellInfo): IGenericCellViewModel;
	focusNextNotebookCell(cell: IGenericCellViewModel, focus: 'editor' | 'container' | 'output'): Promise<void>;
	updateOutputHeight(cellInfo: ICommonCellInfo, output: IDisplayOutputViewModel, height: number, isInit: boolean, source?: string): void;
	scheduleOutputHeightAck(cellInfo: ICommonCellInfo, outputId: string, height: number): void;
	updateMarkupCellHeight(cellId: string, height: number, isInit: boolean): void;
	setMarkupCellEditState(cellId: string, editState: CellEditState): void;
	didStartDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void;
	didDragMarkupCell(cellId: string, event: { dragOffsetY: number }): void;
	didDropMarkupCell(cellId: string, event: { dragOffsetY: number; ctrlKey: boolean; altKey: boolean }): void;
	didEndDragMarkupCell(cellId: string): void;
	didResizeOutput(cellId: string): void;
	setScrollTop(scrollTop: number): void;
	triggerScroll(event: IMouseWheelEvent): void;
	updatePerformanceMetadata(cellId: string, executionId: string, duration: number, rendererId: string): void;
	didFocusOutputInputChange(inputFocused: boolean): void;
}

interface BacklayerWebviewOptions {
	readonly outputNodePadding: number;
	readonly outputNodeLeftPadding: number;
	readonly previewNodePadding: number;
	readonly markdownLeftMargin: number;
	readonly leftMargin: number;
	readonly rightMargin: number;
	readonly runGutter: number;
	readonly dragAndDropEnabled: boolean;
	readonly fontSize: number;
	readonly outputFontSize: number;
	readonly fontFamily: string;
	readonly outputFontFamily: string;
	readonly markupFontSize: number;
	readonly outputLineHeight: number;
	readonly outputScrolling: boolean;
	readonly outputWordWrap: boolean;
	readonly outputLineLimit: number;
}


export class BackLayerWebView<T extends ICommonCellInfo> extends Themable {

	private static _originStore?: WebviewOriginStore;

	private static getOriginStore(storageService: IStorageService): WebviewOriginStore {
		this._originStore ??= new WebviewOriginStore('notebook.backlayerWebview.origins', storageService);
		return this._originStore;
	}

	element: HTMLElement;
	webview: IWebviewElement | undefined = undefined;
	insetMapping: Map<IDisplayOutputViewModel, ICachedInset<T>> = new Map();
	pendingWebviewIdleCreationRequest: Map<IDisplayOutputViewModel, IDisposable> = new Map();
	pendingWebviewIdleInsetMapping: Map<IDisplayOutputViewModel, ICachedInset<T>> = new Map();
	private reversedPendingWebviewIdleInsetMapping: Map<string, IDisplayOutputViewModel> = new Map();

	readonly markupPreviewMapping = new Map<string, IMarkupCellInitialization>();
	private hiddenInsetMapping: Set<IDisplayOutputViewModel> = new Set();
	private reversedInsetMapping: Map<string, IDisplayOutputViewModel> = new Map();
	private localResourceRootsCache: URI[] | undefined = undefined;
	private readonly _onMessage = this._register(new Emitter<INotebookWebviewMessage>());
	private readonly _preloadsCache = new Set<string>();
	public readonly onMessage: Event<INotebookWebviewMessage> = this._onMessage.event;
	private _disposed = false;
	private _currentKernel?: INotebookKernel;

	private firstInit = true;
	private initializeMarkupPromise?: { readonly requestId: string; readonly p: DeferredPromise<void>; readonly isFirstInit: boolean };

	private readonly nonce = UUID.generateUuid();

	constructor(
		public notebookEditor: INotebookDelegateForWebview,
		private readonly id: string,
		public readonly notebookViewType: string,
		public readonly documentUri: URI,
		private options: BacklayerWebviewOptions,
		private readonly rendererMessaging: IScopedRendererMessaging | undefined,
		@IWebviewService private readonly webviewService: IWebviewService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@IPathService private readonly pathService: IPathService,
		@INotebookLoggingService private readonly notebookLogService: INotebookLoggingService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService
	) {
		super(themeService);

		this._logRendererDebugMessage('Creating backlayer webview for notebook');

		this.element = document.createElement('div');

		this.element.style.height = '1400px';
		this.element.style.position = 'absolute';

		if (rendererMessaging) {
			this._register(rendererMessaging);
			rendererMessaging.receiveMessageHandler = (rendererId, message) => {
				if (!this.webview || this._disposed) {
					return Promise.resolve(false);
				}

				this._sendMessageToWebview({
					__vscode_notebook_message: true,
					type: 'customRendererMessage',
					rendererId: rendererId,
					message: message
				});

				return Promise.resolve(true);
			};
		}

		this._register(workspaceTrustManagementService.onDidChangeTrust(e => {
			const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), undefined);
			const htmlContent = this.generateContent(baseUrl.toString());
			this.webview?.setHtml(htmlContent);
		}));

		this._register(TokenizationRegistry.onDidChange(() => {
			this._sendMessageToWebview({
				type: 'tokenizedStylesChanged',
				css: getTokenizationCss(),
			});
		}));
	}

	updateOptions(options: BacklayerWebviewOptions) {
		this.options = options;
		this._updateStyles();
		this._updateOptions();
	}

	private _logRendererDebugMessage(msg: string) {
		this.notebookLogService.debug('BacklayerWebview', `${this.documentUri} (${this.id}) - ${msg}`);
	}

	private _updateStyles() {
		this._sendMessageToWebview({
			type: 'notebookStyles',
			styles: this._generateStyles()
		});
	}

	private _updateOptions() {
		this._sendMessageToWebview({
			type: 'notebookOptions',
			options: {
				dragAndDropEnabled: this.options.dragAndDropEnabled
			},
			renderOptions: {
				lineLimit: this.options.outputLineLimit,
				outputScrolling: this.options.outputScrolling,
				outputWordWrap: this.options.outputWordWrap
			}
		});
	}

	private _generateStyles() {
		return {
			'notebook-output-left-margin': `${this.options.leftMargin + this.options.runGutter}px`,
			'notebook-output-width': `calc(100% - ${this.options.leftMargin + this.options.rightMargin + this.options.runGutter}px)`,
			'notebook-output-node-padding': `${this.options.outputNodePadding}px`,
			'notebook-run-gutter': `${this.options.runGutter}px`,
			'notebook-preview-node-padding': `${this.options.previewNodePadding}px`,
			'notebook-markdown-left-margin': `${this.options.markdownLeftMargin}px`,
			'notebook-output-node-left-padding': `${this.options.outputNodeLeftPadding}px`,
			'notebook-markdown-min-height': `${this.options.previewNodePadding * 2}px`,
			'notebook-markup-font-size': typeof this.options.markupFontSize === 'number' && this.options.markupFontSize > 0 ? `${this.options.markupFontSize}px` : `calc(${this.options.fontSize}px * 1.2)`,
			'notebook-cell-output-font-size': `${this.options.outputFontSize || this.options.fontSize}px`,
			'notebook-cell-output-line-height': `${this.options.outputLineHeight}px`,
			'notebook-cell-output-max-height': `${this.options.outputLineHeight * this.options.outputLineLimit}px`,
			'notebook-cell-output-font-family': this.options.outputFontFamily || this.options.fontFamily,
			'notebook-cell-markup-empty-content': nls.localize('notebook.emptyMarkdownPlaceholder', "Empty markdown cell, double-click or press enter to edit."),
			'notebook-cell-renderer-not-found-error': nls.localize({
				key: 'notebook.error.rendererNotFound',
				comment: ['$0 is a placeholder for the mime type']
			}, "No renderer found for '$0'"),
			'notebook-cell-renderer-fallbacks-exhausted': nls.localize({
				key: 'notebook.error.rendererFallbacksExhausted',
				comment: ['$0 is a placeholder for the mime type']
			}, "Could not render content for '$0'"),
		};
	}

	private generateContent(baseUrl: string) {
		const renderersData = this.getRendererData();
		const preloadsData = this.getStaticPreloadsData();
		const renderOptions = {
			lineLimit: this.options.outputLineLimit,
			outputScrolling: this.options.outputScrolling,
			outputWordWrap: this.options.outputWordWrap
		};
		const preloadScript = preloadsScriptStr(
			{
				...this.options,
				tokenizationCss: getTokenizationCss(),
			},
			{ dragAndDropEnabled: this.options.dragAndDropEnabled },
			renderOptions,
			renderersData,
			preloadsData,
			this.workspaceTrustManagementService.isWorkspaceTrusted(),
			this.nonce);

		const enableCsp = this.configurationService.getValue('notebook.experimental.enableCsp');
		const currentHighlight = this.getColor(editorFindMatch);
		const findMatchHighlight = this.getColor(editorFindMatchHighlight);
		return /* html */`
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<base href="${baseUrl}/" />
				${enableCsp ?
				`<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					script-src ${webviewGenericCspSource} 'unsafe-inline' 'unsafe-eval';
					style-src ${webviewGenericCspSource} 'unsafe-inline';
					img-src ${webviewGenericCspSource} https: http: data:;
					font-src ${webviewGenericCspSource} https:;
					connect-src https:;
					child-src https: data:;
				">` : ''}
				<style nonce="${this.nonce}">
					::highlight(find-highlight) {
						background-color: var(--vscode-editor-findMatchBackground, ${findMatchHighlight});
					}

					::highlight(current-find-highlight) {
						background-color: var(--vscode-editor-findMatchHighlightBackground, ${currentHighlight});
					}

					#container .cell_container {
						width: 100%;
					}

					#container .output_container {
						width: 100%;
					}

					#container > div > div > div.output {
						font-size: var(--notebook-cell-output-font-size);
						width: var(--notebook-output-width);
						margin-left: var(--notebook-output-left-margin);
						background-color: var(--theme-notebook-output-background);
						padding-top: var(--notebook-output-node-padding);
						padding-right: var(--notebook-output-node-padding);
						padding-bottom: var(--notebook-output-node-padding);
						padding-left: var(--notebook-output-node-left-padding);
						box-sizing: border-box;
						border-top: none;
					}

					/* markdown */
					#container div.preview {
						width: 100%;
						padding-right: var(--notebook-preview-node-padding);
						padding-left: var(--notebook-markdown-left-margin);
						padding-top: var(--notebook-preview-node-padding);
						padding-bottom: var(--notebook-preview-node-padding);

						box-sizing: border-box;
						white-space: nowrap;
						overflow: hidden;
						white-space: initial;

						font-size: var(--notebook-markup-font-size);
						color: var(--theme-ui-foreground);
					}

					#container div.preview.draggable {
						user-select: none;
						-webkit-user-select: none;
						-ms-user-select: none;
						cursor: grab;
					}

					#container div.preview.selected {
						background: var(--theme-notebook-cell-selected-background);
					}

					#container div.preview.dragging {
						background-color: var(--theme-background);
						opacity: 0.5 !important;
					}

					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex img,
					.monaco-workbench.vs-dark .notebookOverlay .cell.markdown .latex-block img {
						filter: brightness(0) invert(1)
					}

					#container .markup > div.nb-symbolHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container > div.nb-cellDeleted .output_container {
						background-color: var(--theme-notebook-diff-removed-background);
					}

					#container > div.nb-cellAdded .output_container {
						background-color: var(--theme-notebook-diff-inserted-background);
					}

					#container > div > div:not(.preview) > div {
						overflow-x: auto;
					}

					#container .no-renderer-error {
						color: var(--vscode-editorError-foreground);
					}

					body {
						padding: 0px;
						height: 100%;
						width: 100%;
					}

					table, thead, tr, th, td, tbody {
						border: none !important;
						border-color: transparent;
						border-spacing: 0;
						border-collapse: collapse;
					}

					table, th, tr {
						vertical-align: middle;
						text-align: right;
					}

					thead {
						font-weight: bold;
						background-color: rgba(130, 130, 130, 0.16);
					}

					th, td {
						padding: 4px 8px;
					}

					tr:nth-child(even) {
						background-color: rgba(130, 130, 130, 0.08);
					}

					tbody th {
						font-weight: normal;
					}

					.find-match {
						background-color: var(--vscode-editor-findMatchHighlightBackground);
					}

					.current-find-match {
						background-color: var(--vscode-editor-findMatchBackground);
					}

					#_defaultColorPalatte {
						color: var(--vscode-editor-findMatchHighlightBackground);
						background-color: var(--vscode-editor-findMatchBackground);
					}
				</style>
			</head>
			<body style="overflow: hidden;">
				<div id='findStart' tabIndex=-1></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
				<div id="_defaultColorPalatte"></div>
				<script type="module">${preloadScript}</script>
			</body>
		</html>`;
	}

	private getRendererData(): RendererMetadata[] {
		return this.notebookService.getRenderers().map((renderer): RendererMetadata => {
			const entrypoint = {
				extends: renderer.entrypoint.extends,
				path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
			};
			return {
				id: renderer.id,
				entrypoint,
				mimeTypes: renderer.mimeTypes,
				messaging: renderer.messaging !== RendererMessagingSpec.Never,
				isBuiltin: renderer.isBuiltin
			};
		});
	}

	private getStaticPreloadsData(): StaticPreloadMetadata[] {
		return Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), preload => {
			return { entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation).toString().toString() };
		});
	}

	private asWebviewUri(uri: URI, fromExtension: URI | undefined) {
		return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : undefined);
	}

	postKernelMessage(message: any) {
		this._sendMessageToWebview({
			__vscode_notebook_message: true,
			type: 'customKernelMessage',
			message,
		});
	}

	private resolveOutputId(id: string): { cellInfo: T; output: ICellOutputViewModel } | undefined {
		const output = this.reversedInsetMapping.get(id);
		if (!output) {
			return;
		}

		const cellInfo = this.insetMapping.get(output)!.cellInfo;
		return { cellInfo, output };
	}

	isResolved(): this is IResolvedBackLayerWebview {
		return !!this.webview;
	}

	createWebview(): Promise<void> {
		const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), undefined);
		const htmlContent = this.generateContent(baseUrl.toString());
		return this._initialize(htmlContent);
	}

	private getNotebookBaseUri() {
		if (this.documentUri.scheme === Schemas.untitled) {
			const folder = this.workspaceContextService.getWorkspaceFolder(this.documentUri);
			if (folder) {
				return folder.uri;
			}

			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length) {
				return folders[0].uri;
			}
		}

		return dirname(this.documentUri);
	}

	private getBuiltinLocalResourceRoots(): URI[] {
		// Python notebooks assume that requirejs is a global.
		// For all other notebooks, they need to provide their own loader.
		if (!this.documentUri.path.toLowerCase().endsWith('.ipynb')) {
			return [];
		}

		if (isWeb) {
			return []; // script is inlined
		}

		return [
			dirname(FileAccess.asFileUri('vs/loader.js')),
		];
	}

	private _initialize(content: string): Promise<void> {
		if (!document.body.contains(this.element)) {
			throw new Error('Element is already detached from the DOM tree');
		}

		this.webview = this._createInset(this.webviewService, content);
		this.webview.mountTo(this.element);
		this._register(this.webview);

		this._register(new WebviewWindowDragMonitor(() => this.webview));

		const initializePromise = new DeferredPromise<void>();

		this._register(this.webview.onFatalError(e => {
			initializePromise.error(new Error(`Could not initialize webview: ${e.message}}`));
		}));

		this._register(this.webview.onMessage(async (message) => {
			const data: FromWebviewMessage | { readonly __vscode_notebook_message: undefined } = message.message;
			if (this._disposed) {
				return;
			}

			if (!data.__vscode_notebook_message) {
				return;
			}

			switch (data.type) {
				case 'initialized': {
					initializePromise.complete();
					this.initializeWebViewState();
					break;
				}
				case 'initializedMarkup': {
					if (this.initializeMarkupPromise?.requestId === data.requestId) {
						this.initializeMarkupPromise?.p.complete();
						this.initializeMarkupPromise = undefined;
					}
					break;
				}
				case 'dimension': {
					for (const update of data.updates) {
						const height = update.height;
						if (update.isOutput) {
							const resolvedResult = this.resolveOutputId(update.id);
							if (resolvedResult) {
								const { cellInfo, output } = resolvedResult;
								this.notebookEditor.updateOutputHeight(cellInfo, output, height, !!update.init, 'webview#dimension');
								this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);
							} else if (update.init) {
								// might be idle render request's ack
								const outputRequest = this.reversedPendingWebviewIdleInsetMapping.get(update.id);
								if (outputRequest) {
									const inset = this.pendingWebviewIdleInsetMapping.get(outputRequest)!;

									// clear the pending mapping
									this.pendingWebviewIdleCreationRequest.delete(outputRequest);
									this.pendingWebviewIdleCreationRequest.delete(outputRequest);

									const cellInfo = inset.cellInfo;
									this.reversedInsetMapping.set(update.id, outputRequest);
									this.insetMapping.set(outputRequest, inset);
									this.notebookEditor.updateOutputHeight(cellInfo, outputRequest, height, !!update.init, 'webview#dimension');
									this.notebookEditor.scheduleOutputHeightAck(cellInfo, update.id, height);

								}

								this.reversedPendingWebviewIdleInsetMapping.delete(update.id);
							}

							{
								if (!update.init) {
									continue;
								}

								const output = this.reversedInsetMapping.get(update.id);

								if (!output) {
									continue;
								}

								const inset = this.insetMapping.get(output)!;
								inset.initialized = true;
							}
						} else {
							this.notebookEditor.updateMarkupCellHeight(update.id, height, !!update.init);
						}
					}
					break;
				}
				case 'mouseenter': {
					const resolvedResult = this.resolveOutputId(data.id);
					if (resolvedResult) {
						const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
						if (latestCell) {
							latestCell.outputIsHovered = true;
						}
					}
					break;
				}
				case 'mouseleave': {
					const resolvedResult = this.resolveOutputId(data.id);
					if (resolvedResult) {
						const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
						if (latestCell) {
							latestCell.outputIsHovered = false;
						}
					}
					break;
				}
				case 'outputFocus': {
					const resolvedResult = this.resolveOutputId(data.id);
					if (resolvedResult) {
						const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
						if (latestCell) {
							latestCell.outputIsFocused = true;
							this.notebookEditor.focusNotebookCell(latestCell, 'output', { skipReveal: true });
						}
					}
					break;
				}
				case 'outputBlur': {
					const resolvedResult = this.resolveOutputId(data.id);
					if (resolvedResult) {
						const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
						if (latestCell) {
							latestCell.outputIsFocused = false;
						}
					}
					break;
				}
				case 'scroll-ack': {
					// const date = new Date();
					// const top = data.data.top;
					// console.log('ack top ', top, ' version: ', data.version, ' - ', date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds());
					break;
				}
				case 'scroll-to-reveal': {
					this.notebookEditor.setScrollTop(data.scrollTop - NOTEBOOK_WEBVIEW_BOUNDARY);
					break;
				}
				case 'did-scroll-wheel': {
					this.notebookEditor.triggerScroll({
						...data.payload,
						preventDefault: () => { },
						stopPropagation: () => { }
					});
					break;
				}
				case 'focus-editor': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell) {
						if (data.focusNext) {
							this.notebookEditor.focusNextNotebookCell(cell, 'editor');
						} else {
							await this.notebookEditor.focusNotebookCell(cell, 'editor');
						}
					}
					break;
				}
				case 'clicked-data-url': {
					this._onDidClickDataLink(data);
					break;
				}
				case 'clicked-link': {
					if (matchesScheme(data.href, Schemas.command)) {
						const uri = URI.parse(data.href);

						if (uri.path === 'workbench.action.openLargeOutput') {
							const outputId = uri.query;
							const group = this.editorGroupService.activeGroup;
							if (group) {
								if (group.activeEditor) {
									group.pinEditor(group.activeEditor);
								}
							}

							this.openerService.open(CellUri.generateCellOutputUri(this.documentUri, outputId));
							return;
						}
						if (uri.path === 'cellOutput.enableScrolling') {
							const outputId = uri.query;
							const cell = this.reversedInsetMapping.get(outputId);

							if (cell) {
								this.telemetryService.publicLog2<WorkbenchActionExecutedEvent, WorkbenchActionExecutedClassification>
									('workbenchActionExecuted', { id: 'notebook.cell.toggleOutputScrolling', from: 'inlineLink' });

								cell.cellViewModel.outputsViewModels.forEach((vm) => {
									if (vm.model.metadata) {
										vm.model.metadata['scrollable'] = true;
										vm.resetRenderer();
									}
								});
							}

							return;
						}

						// We allow a very limited set of commands
						this.openerService.open(data.href, {
							fromUserGesture: true,
							fromWorkspace: true,
							allowCommands: [
								'github-issues.authNow',
								'workbench.extensions.search',
								'workbench.action.openSettings',
								'_notebook.selectKernel',
								// TODO@rebornix explore open output channel with name command
								'jupyter.viewOutput'
							],
						});
						return;
					}

					if (matchesSomeScheme(data.href, Schemas.http, Schemas.https, Schemas.mailto)) {
						this.openerService.open(data.href, { fromUserGesture: true, fromWorkspace: true });
					} else if (matchesScheme(data.href, Schemas.vscodeNotebookCell)) {
						const uri = URI.parse(data.href);
						this._handleNotebookCellResource(uri);
					} else if (!/^[\w\-]+:/.test(data.href)) {
						this._handleResourceOpening(data.href);
					} else {
						// uri with scheme
						if (osPath.isAbsolute(data.href)) {
							this._openUri(URI.file(data.href));
						} else {
							this._openUri(URI.parse(data.href));
						}
					}
					break;
				}
				case 'customKernelMessage': {
					this._onMessage.fire({ message: data.message });
					break;
				}
				case 'customRendererMessage': {
					this.rendererMessaging?.postMessage(data.rendererId, data.message);
					break;
				}
				case 'clickMarkupCell': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell) {
						if (data.shiftKey || (isMacintosh ? data.metaKey : data.ctrlKey)) {
							// Modify selection
							this.notebookEditor.toggleNotebookCellSelection(cell, /* fromPrevious */ data.shiftKey);
						} else {
							// Normal click
							await this.notebookEditor.focusNotebookCell(cell, 'container', { skipReveal: true });
						}
					}
					break;
				}
				case 'contextMenuMarkupCell': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell) {
						// Focus the cell first
						await this.notebookEditor.focusNotebookCell(cell, 'container', { skipReveal: true });

						// Then show the context menu
						const webviewRect = this.element.getBoundingClientRect();
						this.contextMenuService.showContextMenu({
							menuId: MenuId.NotebookCellTitle,
							contextKeyService: this.contextKeyService,
							getAnchor: () => ({
								x: webviewRect.x + data.clientX,
								y: webviewRect.y + data.clientY
							})
						});
					}
					break;
				}
				case 'toggleMarkupPreview': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell && !this.notebookEditor.creationOptions.isReadOnly) {
						this.notebookEditor.setMarkupCellEditState(data.cellId, CellEditState.Editing);
						await this.notebookEditor.focusNotebookCell(cell, 'editor', { skipReveal: true });
					}
					break;
				}
				case 'mouseEnterMarkupCell': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell instanceof MarkupCellViewModel) {
						cell.cellIsHovered = true;
					}
					break;
				}
				case 'mouseLeaveMarkupCell': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell instanceof MarkupCellViewModel) {
						cell.cellIsHovered = false;
					}
					break;
				}
				case 'cell-drag-start': {
					this.notebookEditor.didStartDragMarkupCell(data.cellId, data);
					break;
				}
				case 'cell-drag': {
					this.notebookEditor.didDragMarkupCell(data.cellId, data);
					break;
				}
				case 'cell-drop': {
					this.notebookEditor.didDropMarkupCell(data.cellId, {
						dragOffsetY: data.dragOffsetY,
						ctrlKey: data.ctrlKey,
						altKey: data.altKey,
					});
					break;
				}
				case 'cell-drag-end': {
					this.notebookEditor.didEndDragMarkupCell(data.cellId);
					break;
				}
				case 'renderedMarkup': {
					const cell = this.notebookEditor.getCellById(data.cellId);
					if (cell instanceof MarkupCellViewModel) {
						cell.renderedHtml = data.html;
					}

					this._handleHighlightCodeBlock(data.codeBlocks);
					break;
				}
				case 'renderedCellOutput': {
					this._handleHighlightCodeBlock(data.codeBlocks);
					break;
				}
				case 'outputResized': {
					this.notebookEditor.didResizeOutput(data.cellId);
					break;
				}
				case 'getOutputItem': {
					const resolvedResult = this.resolveOutputId(data.outputId);
					const output = resolvedResult?.output.model.outputs.find(output => output.mime === data.mime);

					this._sendMessageToWebview({
						type: 'returnOutputItem',
						requestId: data.requestId,
						output: output ? { mime: output.mime, valueBytes: output.data.buffer } : undefined,
					});
					break;
				}
				case 'logRendererDebugMessage': {
					this._logRendererDebugMessage(`${data.message}${data.data ? ' ' + JSON.stringify(data.data, null, 4) : ''}`);
					break;
				}
				case 'notebookPerformanceMessage': {
					this.notebookEditor.updatePerformanceMetadata(data.cellId, data.executionId, data.duration, data.rendererId);
					break;
				}
				case 'outputInputFocus': {
					this.notebookEditor.didFocusOutputInputChange(data.inputFocused);
				}
			}
		}));

		return initializePromise.p;
	}

	private _handleNotebookCellResource(uri: URI) {
		const lineMatch = /\?line=(\d+)$/.exec(uri.fragment);
		if (lineMatch) {
			const parsedLineNumber = parseInt(lineMatch[1], 10);
			if (!isNaN(parsedLineNumber)) {
				const lineNumber = parsedLineNumber + 1;
				const fragment = uri.fragment.substring(0, lineMatch.index);

				// open the uri with selection
				const editorOptions: ITextEditorOptions = {
					selection: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 }
				};
				this.openerService.open(uri.with({ fragment }), {
					fromUserGesture: true,
					fromWorkspace: true,
					editorOptions: editorOptions
				});
				return;
			}
		}

		this.openerService.open(uri, { fromUserGesture: true, fromWorkspace: true });
		return uri;
	}

	private _handleResourceOpening(href: string) {
		let linkToOpen: URI | undefined = undefined;
		if (href.startsWith('/')) {
			linkToOpen = URI.parse(href);
		} else if (href.startsWith('~')) {
			const userHome = this.pathService.resolvedUserHome;
			if (userHome) {
				linkToOpen = URI.parse(osPath.join(userHome.fsPath, href.substring(1)));
			}
		} else {
			if (this.documentUri.scheme === Schemas.untitled) {
				const folders = this.workspaceContextService.getWorkspace().folders;
				if (!folders.length) {
					return;
				}
				linkToOpen = URI.joinPath(folders[0].uri, href);
			} else {
				// Resolve relative to notebook document
				linkToOpen = URI.joinPath(dirname(this.documentUri), href);
			}
		}

		if (linkToOpen) {
			this._openUri(linkToOpen);
		}
	}

	private _openUri(uri: URI) {
		let lineNumber: number | undefined = undefined;
		let column: number | undefined = undefined;
		const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
		if (lineCol) {
			uri = uri.with({
				path: uri.path.slice(0, lineCol.index),
				fragment: `L${lineCol[0].slice(1)}`
			});
			lineNumber = parseInt(lineCol[1], 10);
			column = parseInt(lineCol[2], 10);
		}

		//#region error renderer migration, remove once done
		const lineMatch = LineQueryRegex.exec(uri.query);
		if (lineMatch) {
			const parsedLineNumber = parseInt(lineMatch[1], 10);
			if (!isNaN(parsedLineNumber)) {
				lineNumber = parsedLineNumber + 1;
				column = 1;
				uri = uri.with({ fragment: `L${lineNumber}` });
			}
		}

		uri = uri.with({
			query: null
		});
		//#endregion

		let match: { group: IEditorGroup; editor: EditorInput } | undefined = undefined;

		for (const group of this.editorGroupService.groups) {
			const editorInput = group.editors.find(editor => editor.resource && isEqual(editor.resource, uri, true));
			if (editorInput) {
				match = { group, editor: editorInput };
				break;
			}
		}

		if (match) {
			match.group.openEditor(match.editor, lineNumber !== undefined && column !== undefined ? <ITextEditorOptions>{ selection: { startLineNumber: lineNumber, startColumn: column } } : undefined);
		} else {
			this.openerService.open(uri, { fromUserGesture: true, fromWorkspace: true });
		}
	}

	private _handleHighlightCodeBlock(codeBlocks: ReadonlyArray<ICodeBlockHighlightRequest>) {
		for (const { id, value, lang } of codeBlocks) {
			// The language id may be a language aliases (e.g.js instead of javascript)
			const languageId = this.languageService.getLanguageIdByLanguageName(lang);
			if (!languageId) {
				continue;
			}

			tokenizeToString(this.languageService, value, languageId).then((html) => {
				if (this._disposed) {
					return;
				}
				this._sendMessageToWebview({
					type: 'tokenizedCodeBlock',
					html,
					codeBlockId: id
				});
			});
		}
	}
	private async _onDidClickDataLink(event: IClickedDataUrlMessage): Promise<void> {
		if (typeof event.data !== 'string') {
			return;
		}

		const [splitStart, splitData] = event.data.split(';base64,');
		if (!splitData || !splitStart) {
			return;
		}

		const defaultDir = extname(this.documentUri) === '.interactive' ?
			this.workspaceContextService.getWorkspace().folders[0]?.uri ?? await this.fileDialogService.defaultFilePath() :
			dirname(this.documentUri);
		let defaultName: string;
		if (event.downloadName) {
			defaultName = event.downloadName;
		} else {
			const mimeType = splitStart.replace(/^data:/, '');
			const candidateExtension = mimeType && getExtensionForMimeType(mimeType);
			defaultName = candidateExtension ? `download${candidateExtension}` : 'download';
		}

		const defaultUri = joinPath(defaultDir, defaultName);
		const newFileUri = await this.fileDialogService.showSaveDialog({
			defaultUri
		});
		if (!newFileUri) {
			return;
		}

		const buff = decodeBase64(splitData);
		await this.fileService.writeFile(newFileUri, buff);
		await this.openerService.open(newFileUri);
	}

	private _createInset(webviewService: IWebviewService, content: string) {
		this.localResourceRootsCache = this._getResourceRootsCache();
		const webview = webviewService.createWebviewElement({
			origin: BackLayerWebView.getOriginStore(this.storageService).getOrigin(this.notebookViewType, undefined),
			title: nls.localize('webview title', "Notebook webview content"),
			options: {
				purpose: WebviewContentPurpose.NotebookRenderer,
				enableFindWidget: false,
				transformCssVariables: transformWebviewThemeVars,
			},
			contentOptions: {
				allowMultipleAPIAcquire: true,
				allowScripts: true,
				localResourceRoots: this.localResourceRootsCache,
			},
			extension: undefined
		});

		webview.setHtml(content);
		return webview;
	}

	private _getResourceRootsCache(): URI[] {
		const workspaceFolders = this.contextService.getWorkspace().folders.map(x => x.uri);
		const notebookDir = this.getNotebookBaseUri();
		return [
			this.notebookService.getNotebookProviderResourceRoots(),
			this.notebookService.getRenderers().map(x => dirname(x.entrypoint.path)),
			...Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), x => [
				dirname(x.entrypoint),
				...x.localResourceRoots,
			]),
			workspaceFolders,
			notebookDir,
			this.getBuiltinLocalResourceRoots()
		].flat();
	}

	private initializeWebViewState() {
		this._preloadsCache.clear();
		if (this._currentKernel) {
			this._updatePreloadsFromKernel(this._currentKernel);
		}

		for (const [output, inset] of this.insetMapping.entries()) {
			this._sendMessageToWebview({ ...inset.cachedCreation, initiallyHidden: this.hiddenInsetMapping.has(output) });
		}

		if (this.initializeMarkupPromise?.isFirstInit) {
			// On first run the contents have already been initialized so we don't need to init them again
			// no op
		} else {
			const mdCells = [...this.markupPreviewMapping.values()];
			this.markupPreviewMapping.clear();
			this.initializeMarkup(mdCells);
		}

		this._updateStyles();
		this._updateOptions();
	}

	private shouldUpdateInset(cell: IGenericCellViewModel, output: ICellOutputViewModel, cellTop: number, outputOffset: number): boolean {
		if (this._disposed) {
			return false;
		}

		if ('isOutputCollapsed' in cell && (cell as ICellViewModel).isOutputCollapsed) {
			return false;
		}

		if (this.hiddenInsetMapping.has(output)) {
			return true;
		}

		const outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			return false;
		}

		if (outputOffset === outputCache.cachedCreation.outputOffset && cellTop === outputCache.cachedCreation.cellTop) {
			return false;
		}

		return true;
	}

	ackHeight(updates: readonly IAckOutputHeight[]): void {
		this._sendMessageToWebview({
			type: 'ack-dimension',
			updates
		});
	}

	updateScrollTops(outputRequests: IDisplayOutputLayoutUpdateRequest[], markupPreviews: { id: string; top: number }[]) {
		if (this._disposed) {
			return;
		}

		const widgets = coalesce(outputRequests.map((request): IContentWidgetTopRequest | undefined => {
			const outputCache = this.insetMapping.get(request.output);
			if (!outputCache) {
				return;
			}

			if (!request.forceDisplay && !this.shouldUpdateInset(request.cell, request.output, request.cellTop, request.outputOffset)) {
				return;
			}

			const id = outputCache.outputId;
			outputCache.cachedCreation.cellTop = request.cellTop;
			outputCache.cachedCreation.outputOffset = request.outputOffset;
			this.hiddenInsetMapping.delete(request.output);

			return {
				cellId: request.cell.id,
				outputId: id,
				cellTop: request.cellTop,
				outputOffset: request.outputOffset,
				forceDisplay: request.forceDisplay,
			};
		}));

		if (!widgets.length && !markupPreviews.length) {
			return;
		}

		this._sendMessageToWebview({
			type: 'view-scroll',
			widgets: widgets,
			markupCells: markupPreviews,
		});
	}

	private async createMarkupPreview(initialization: IMarkupCellInitialization) {
		if (this._disposed) {
			return;
		}

		if (this.markupPreviewMapping.has(initialization.cellId)) {
			console.error('Trying to create markup preview that already exists');
			return;
		}

		this.markupPreviewMapping.set(initialization.cellId, initialization);
		this._sendMessageToWebview({
			type: 'createMarkupCell',
			cell: initialization
		});
	}

	async showMarkupPreview(newContent: IMarkupCellInitialization) {
		if (this._disposed) {
			return;
		}

		const entry = this.markupPreviewMapping.get(newContent.cellId);
		if (!entry) {
			return this.createMarkupPreview(newContent);
		}

		const sameContent = newContent.content === entry.content;
		const sameMetadata = (equals(newContent.metadata, entry.metadata));
		if (!sameContent || !sameMetadata || !entry.visible) {
			this._sendMessageToWebview({
				type: 'showMarkupCell',
				id: newContent.cellId,
				handle: newContent.cellHandle,
				// If the content has not changed, we still want to make sure the
				// preview is visible but don't need to send anything over
				content: sameContent ? undefined : newContent.content,
				top: newContent.offset,
				metadata: sameMetadata ? undefined : newContent.metadata
			});
		}
		entry.metadata = newContent.metadata;
		entry.content = newContent.content;
		entry.offset = newContent.offset;
		entry.visible = true;
	}

	async hideMarkupPreviews(cellIds: readonly string[]) {
		if (this._disposed) {
			return;
		}

		const cellsToHide: string[] = [];
		for (const cellId of cellIds) {
			const entry = this.markupPreviewMapping.get(cellId);
			if (entry) {
				if (entry.visible) {
					cellsToHide.push(cellId);
					entry.visible = false;
				}
			}
		}

		if (cellsToHide.length) {
			this._sendMessageToWebview({
				type: 'hideMarkupCells',
				ids: cellsToHide
			});
		}
	}

	async unhideMarkupPreviews(cellIds: readonly string[]) {
		if (this._disposed) {
			return;
		}

		const toUnhide: string[] = [];
		for (const cellId of cellIds) {
			const entry = this.markupPreviewMapping.get(cellId);
			if (entry) {
				if (!entry.visible) {
					entry.visible = true;
					toUnhide.push(cellId);
				}
			} else {
				console.error(`Trying to unhide a preview that does not exist: ${cellId}`);
			}
		}

		this._sendMessageToWebview({
			type: 'unhideMarkupCells',
			ids: toUnhide,
		});
	}

	async deleteMarkupPreviews(cellIds: readonly string[]) {
		if (this._disposed) {
			return;
		}

		for (const id of cellIds) {
			if (!this.markupPreviewMapping.has(id)) {
				console.error(`Trying to delete a preview that does not exist: ${id}`);
			}
			this.markupPreviewMapping.delete(id);
		}

		if (cellIds.length) {
			this._sendMessageToWebview({
				type: 'deleteMarkupCell',
				ids: cellIds
			});
		}
	}

	async updateMarkupPreviewSelections(selectedCellsIds: string[]) {
		if (this._disposed) {
			return;
		}

		this._sendMessageToWebview({
			type: 'updateSelectedMarkupCells',
			selectedCellIds: selectedCellsIds.filter(id => this.markupPreviewMapping.has(id)),
		});
	}

	async initializeMarkup(cells: readonly IMarkupCellInitialization[]): Promise<void> {
		if (this._disposed) {
			return;
		}

		this.initializeMarkupPromise?.p.complete();
		const requestId = UUID.generateUuid();
		this.initializeMarkupPromise = { p: new DeferredPromise(), requestId, isFirstInit: this.firstInit };

		this.firstInit = false;

		for (const cell of cells) {
			this.markupPreviewMapping.set(cell.cellId, cell);
		}

		this._sendMessageToWebview({
			type: 'initializeMarkup',
			cells,
			requestId,
		});

		return this.initializeMarkupPromise.p.p;
	}

	/**
	 * Validate if cached inset is out of date and require a rerender
	 * Note that it doesn't account for output content change.
	 */
	private _cachedInsetEqual(cachedInset: ICachedInset<T>, content: IInsetRenderOutput) {
		if (content.type === RenderOutputType.Extension) {
			// Use a new renderer
			return cachedInset.renderer?.id === content.renderer.id;
		} else {
			// The new renderer is the default HTML renderer
			return cachedInset.cachedCreation.type === 'html';
		}
	}

	requestCreateOutputWhenWebviewIdle(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number) {
		if (this._disposed) {
			return;
		}

		if (this.insetMapping.has(content.source)) {
			return;
		}

		if (this.pendingWebviewIdleCreationRequest.has(content.source)) {
			return;
		}

		if (this.pendingWebviewIdleInsetMapping.has(content.source)) {
			// handled in renderer process, waiting for webview to process it when idle
			return;
		}

		this.pendingWebviewIdleCreationRequest.set(content.source, runWhenIdle(() => {
			const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, true, true);
			this._sendMessageToWebview(message, transferable);
			this.pendingWebviewIdleInsetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo: cellInfo, renderer, cachedCreation: message });
			this.reversedPendingWebviewIdleInsetMapping.set(message.outputId, content.source);
			this.pendingWebviewIdleCreationRequest.delete(content.source);
		}));
	}

	createOutput(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number): void {
		if (this._disposed) {
			return;
		}

		const cachedInset = this.insetMapping.get(content.source);

		// we now request to render the output immediately, so we can remove the pending request
		// dispose the pending request in renderer process if it exists
		this.pendingWebviewIdleCreationRequest.get(content.source)?.dispose();
		this.pendingWebviewIdleCreationRequest.delete(content.source);

		// if request has already been sent out, we then remove it from the pending mapping
		this.pendingWebviewIdleInsetMapping.delete(content.source);
		if (cachedInset) {
			this.reversedPendingWebviewIdleInsetMapping.delete(cachedInset.outputId);
		}

		if (cachedInset && this._cachedInsetEqual(cachedInset, content)) {
			this.hiddenInsetMapping.delete(content.source);
			this._sendMessageToWebview({
				type: 'showOutput',
				cellId: cachedInset.cellInfo.cellId,
				outputId: cachedInset.outputId,
				cellTop: cellTop,
				outputOffset: offset
			});
			return;
		}

		// create new output
		const createOutput = () => {
			const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, false, false);
			this._sendMessageToWebview(message, transferable);
			this.insetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo: cellInfo, renderer, cachedCreation: message });
			this.hiddenInsetMapping.delete(content.source);
			this.reversedInsetMapping.set(message.outputId, content.source);
		};

		createOutput();
	}

	private createMetadata(output: ICellOutput, mimeType: string) {
		if (mimeType.startsWith('image')) {
			const buffer = output.outputs.find(out => out.mime === 'text/plain')?.data.buffer;
			if (buffer?.length && buffer?.length > 0) {
				const altText = new TextDecoder().decode(buffer);
				return { ...output.metadata, vscode_altText: altText };
			}
		}
		return output.metadata;
	}

	private _createOutputCreationMessage(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number, createOnIdle: boolean, initiallyHidden: boolean): { readonly message: ICreationRequestMessage; readonly renderer: INotebookRendererInfo | undefined; transfer: readonly ArrayBuffer[] } {
		const messageBase = {
			type: 'html',
			executionId: cellInfo.executionId,
			cellId: cellInfo.cellId,
			cellTop: cellTop,
			outputOffset: offset,
			left: 0,
			requiredPreloads: [],
			createOnIdle: createOnIdle
		} as const;

		const transfer: ArrayBuffer[] = [];

		let message: ICreationRequestMessage;
		let renderer: INotebookRendererInfo | undefined;
		if (content.type === RenderOutputType.Extension) {
			const output = content.source.model;
			renderer = content.renderer;
			const first = output.outputs.find(op => op.mime === content.mimeType)!;
			const metadata = this.createMetadata(output, content.mimeType);
			const valueBytes = copyBufferIfNeeded(first.data.buffer, transfer);
			message = {
				...messageBase,
				outputId: output.outputId,
				rendererId: content.renderer.id,
				content: {
					type: RenderOutputType.Extension,
					outputId: output.outputId,
					metadata: metadata,
					output: {
						mime: first.mime,
						valueBytes,
					},
					allOutputs: output.outputs.map(output => ({ mime: output.mime })),
				},
				initiallyHidden: initiallyHidden
			};
		} else {
			message = {
				...messageBase,
				outputId: UUID.generateUuid(),
				content: {
					type: content.type,
					htmlContent: content.htmlContent,
				},
				initiallyHidden: initiallyHidden
			};
		}

		return {
			message,
			renderer,
			transfer,
		};
	}

	updateOutput(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number): void {
		if (this._disposed) {
			return;
		}

		if (!this.insetMapping.has(content.source)) {
			this.createOutput(cellInfo, content, cellTop, offset);
			return;
		}

		const outputCache = this.insetMapping.get(content.source)!;
		this.hiddenInsetMapping.delete(content.source);
		let updatedContent: ICreationContent | undefined = undefined;

		const transfer: ArrayBuffer[] = [];
		if (content.type === RenderOutputType.Extension) {
			const output = content.source.model;
			const firstBuffer = output.outputs.find(op => op.mime === content.mimeType)!;

			const valueBytes = copyBufferIfNeeded(firstBuffer.data.buffer, transfer);
			updatedContent = {
				type: RenderOutputType.Extension,
				outputId: outputCache.outputId,
				metadata: output.metadata,
				output: {
					mime: content.mimeType,
					valueBytes,
				},
				allOutputs: output.outputs.map(output => ({ mime: output.mime }))
			};
		}

		this._sendMessageToWebview({
			type: 'showOutput',
			cellId: outputCache.cellInfo.cellId,
			outputId: outputCache.outputId,
			cellTop: cellTop,
			outputOffset: offset,
			content: updatedContent
		}, transfer);

		outputCache.versionId = content.source.model.versionId;
		return;
	}

	removeInsets(outputs: readonly ICellOutputViewModel[]): void {
		if (this._disposed) {
			return;
		}

		for (const output of outputs) {
			const outputCache = this.insetMapping.get(output);
			if (!outputCache) {
				continue;
			}

			const id = outputCache.outputId;

			this._sendMessageToWebview({
				type: 'clearOutput',
				rendererId: outputCache.cachedCreation.rendererId,
				cellUri: outputCache.cellInfo.cellUri.toString(),
				outputId: id,
				cellId: outputCache.cellInfo.cellId
			});
			this.insetMapping.delete(output);
			this.pendingWebviewIdleCreationRequest.get(output)?.dispose();
			this.pendingWebviewIdleCreationRequest.delete(output);
			this.pendingWebviewIdleInsetMapping.delete(output);
			this.reversedPendingWebviewIdleInsetMapping.delete(id);
			this.reversedInsetMapping.delete(id);
		}
	}

	hideInset(output: ICellOutputViewModel): void {
		if (this._disposed) {
			return;
		}

		const outputCache = this.insetMapping.get(output);
		if (!outputCache) {
			return;
		}

		this.hiddenInsetMapping.add(output);

		this._sendMessageToWebview({
			type: 'hideOutput',
			outputId: outputCache.outputId,
			cellId: outputCache.cellInfo.cellId,
		});
	}

	focusWebview() {
		if (this._disposed) {
			return;
		}

		this.webview?.focus();
	}

	focusOutput(cellId: string, viewFocused: boolean) {
		if (this._disposed) {
			return;
		}

		if (!viewFocused) {
			this.webview?.focus();
		}

		this._sendMessageToWebview({
			type: 'focus-output',
			cellId,
		});
	}

	async find(query: string, options: { wholeWord?: boolean; caseSensitive?: boolean; includeMarkup: boolean; includeOutput: boolean; shouldGetSearchPreviewInfo: boolean; ownerID: string }): Promise<IFindMatch[]> {
		if (query === '') {
			this._sendMessageToWebview({
				type: 'findStop',
				ownerID: options.ownerID
			});
			return [];
		}

		const p = new Promise<IFindMatch[]>(resolve => {
			const sub = this.webview?.onMessage(e => {
				if (e.message.type === 'didFind') {
					resolve(e.message.matches);
					sub?.dispose();
				}
			});
		});

		this._sendMessageToWebview({
			type: 'find',
			query: query,
			options
		});

		const ret = await p;
		return ret;
	}

	findStop(ownerID: string) {
		this._sendMessageToWebview({
			type: 'findStop',
			ownerID
		});
	}

	async findHighlightCurrent(index: number, ownerID: string): Promise<number> {
		const p = new Promise<number>(resolve => {
			const sub = this.webview?.onMessage(e => {
				if (e.message.type === 'didFindHighlightCurrent') {
					resolve(e.message.offset);
					sub?.dispose();
				}
			});
		});

		this._sendMessageToWebview({
			type: 'findHighlightCurrent',
			index,
			ownerID
		});

		const ret = await p;
		return ret;
	}

	async findUnHighlightCurrent(index: number, ownerID: string): Promise<void> {
		this._sendMessageToWebview({
			type: 'findUnHighlightCurrent',
			index,
			ownerID
		});
	}


	deltaCellContainerClassNames(cellId: string, added: string[], removed: string[]) {
		this._sendMessageToWebview({
			type: 'decorations',
			cellId,
			addedClassNames: added,
			removedClassNames: removed
		});

	}

	updateOutputRenderers() {
		if (!this.webview) {
			return;
		}

		const renderersData = this.getRendererData();
		this.localResourceRootsCache = this._getResourceRootsCache();
		const mixedResourceRoots = [
			...(this.localResourceRootsCache || []),
			...(this._currentKernel ? [this._currentKernel.localResourceRoot] : []),
		];

		this.webview.localResourcesRoot = mixedResourceRoots;
		this._sendMessageToWebview({
			type: 'updateRenderers',
			rendererData: renderersData
		});
	}

	async updateKernelPreloads(kernel: INotebookKernel | undefined) {
		if (this._disposed || kernel === this._currentKernel) {
			return;
		}

		const previousKernel = this._currentKernel;
		this._currentKernel = kernel;

		if (previousKernel && previousKernel.preloadUris.length > 0) {
			this.webview?.reload(); // preloads will be restored after reload
		} else if (kernel) {
			this._updatePreloadsFromKernel(kernel);
		}
	}

	private _updatePreloadsFromKernel(kernel: INotebookKernel) {
		const resources: IControllerPreload[] = [];
		for (const preload of kernel.preloadUris) {
			const uri = this.environmentService.isExtensionDevelopment && (preload.scheme === 'http' || preload.scheme === 'https')
				? preload : this.asWebviewUri(preload, undefined);

			if (!this._preloadsCache.has(uri.toString())) {
				resources.push({ uri: uri.toString(), originalUri: preload.toString() });
				this._preloadsCache.add(uri.toString());
			}
		}

		if (!resources.length) {
			return;
		}

		this._updatePreloads(resources);
	}

	private _updatePreloads(resources: IControllerPreload[]) {
		if (!this.webview) {
			return;
		}

		const mixedResourceRoots = [
			...(this.localResourceRootsCache || []),
			...(this._currentKernel ? [this._currentKernel.localResourceRoot] : []),
		];

		this.webview.localResourcesRoot = mixedResourceRoots;

		this._sendMessageToWebview({
			type: 'preload',
			resources: resources,
		});
	}

	private _sendMessageToWebview(message: ToWebviewMessage, transfer?: readonly ArrayBuffer[]) {
		if (this._disposed) {
			return;
		}

		this.webview?.postMessage(message, transfer);
	}

	override dispose() {
		this._disposed = true;
		this.webview?.dispose();
		this.webview = undefined;
		this.notebookEditor = null!;
		this.insetMapping.clear();
		this.pendingWebviewIdleCreationRequest.clear();
		super.dispose();
	}
}

function copyBufferIfNeeded(buffer: Uint8Array, transfer: ArrayBuffer[]): Uint8Array {
	if (buffer.byteLength === buffer.buffer.byteLength) {
		// No copy needed but we can't transfer either
		return buffer;
	} else {
		// The buffer is smaller than its backing array buffer.
		// Create a copy to avoid sending the entire array buffer.
		const valueBytes = new Uint8Array(buffer);
		transfer.push(valueBytes.buffer);
		return valueBytes;
	}
}

function getTokenizationCss() {
	const colorMap = TokenizationRegistry.getColorMap();
	const tokenizationCss = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
	return tokenizationCss;
}
