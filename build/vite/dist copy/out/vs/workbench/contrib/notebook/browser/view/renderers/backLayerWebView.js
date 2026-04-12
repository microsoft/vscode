/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BackLayerWebView_1;
import { getWindow } from '../../../../../../base/browser/dom.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { DeferredPromise, runWhenGlobalIdle } from '../../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { getExtensionForMimeType, isTextStreamMime } from '../../../../../../base/common/mime.js';
import { FileAccess, Schemas, matchesScheme, matchesSomeScheme } from '../../../../../../base/common/network.js';
import { equals } from '../../../../../../base/common/objects.js';
import * as osPath from '../../../../../../base/common/path.js';
import { isMacintosh, isWeb } from '../../../../../../base/common/platform.js';
import { dirname, extname, isEqual, joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import * as UUID from '../../../../../../base/common/uuid.js';
import { TokenizationRegistry } from '../../../../../../editor/common/languages.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { generateTokensCSSForColorMap } from '../../../../../../editor/common/languages/supports/tokenization.js';
import { tokenizeToString } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import * as nls from '../../../../../../nls.js';
import { MenuId } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { editorFindMatch, editorFindMatchHighlight } from '../../../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, Themable } from '../../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { CellEditState } from '../../notebookBrowser.js';
import { NOTEBOOK_WEBVIEW_BOUNDARY } from '../notebookCellList.js';
import { preloadsScriptStr } from './webviewPreloads.js';
import { transformWebviewThemeVars } from './webviewThemeMapping.js';
import { MarkupCellViewModel } from '../../viewModel/markupCellViewModel.js';
import { CellUri } from '../../../common/notebookCommon.js';
import { INotebookLoggingService } from '../../../common/notebookLoggingService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { IWebviewService, WebviewOriginStore } from '../../../../webview/browser/webview.js';
import { WebviewWindowDragMonitor } from '../../../../webview/browser/webviewWindowDragMonitor.js';
import { asWebviewUri, webviewGenericCspSource } from '../../../../webview/common/webview.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { getOutputText, getOutputStreamText, TEXT_BASED_MIMETYPES } from '../../viewModel/cellOutputTextHelper.js';
const LINE_COLUMN_REGEX = /:([\d]+)(?::([\d]+))?$/;
const LineQueryRegex = /line=(\d+)$/;
const FRAGMENT_REGEX = /^(.*)#([^#]*)$/;
let BackLayerWebView = class BackLayerWebView extends Themable {
    static { BackLayerWebView_1 = this; }
    static getOriginStore(storageService) {
        this._originStore ??= new WebviewOriginStore('notebook.backlayerWebview.origins', storageService);
        return this._originStore;
    }
    constructor(notebookEditor, id, notebookViewType, documentUri, options, rendererMessaging, webviewService, openerService, notebookService, contextService, environmentService, fileDialogService, fileService, contextMenuService, contextKeyService, workspaceTrustManagementService, configurationService, languageService, workspaceContextService, editorGroupService, storageService, pathService, notebookLogService, themeService, telemetryService) {
        super(themeService);
        this.notebookEditor = notebookEditor;
        this.id = id;
        this.notebookViewType = notebookViewType;
        this.documentUri = documentUri;
        this.options = options;
        this.rendererMessaging = rendererMessaging;
        this.webviewService = webviewService;
        this.openerService = openerService;
        this.notebookService = notebookService;
        this.contextService = contextService;
        this.environmentService = environmentService;
        this.fileDialogService = fileDialogService;
        this.fileService = fileService;
        this.contextMenuService = contextMenuService;
        this.contextKeyService = contextKeyService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.configurationService = configurationService;
        this.languageService = languageService;
        this.workspaceContextService = workspaceContextService;
        this.editorGroupService = editorGroupService;
        this.storageService = storageService;
        this.pathService = pathService;
        this.notebookLogService = notebookLogService;
        this.telemetryService = telemetryService;
        this.webview = undefined;
        this.insetMapping = new Map();
        this.pendingWebviewIdleCreationRequest = new Map();
        this.pendingWebviewIdleInsetMapping = new Map();
        this.reversedPendingWebviewIdleInsetMapping = new Map();
        this.markupPreviewMapping = new Map();
        this.hiddenInsetMapping = new Set();
        this.reversedInsetMapping = new Map();
        this.localResourceRootsCache = undefined;
        this._onMessage = this._register(new Emitter());
        this._preloadsCache = new Set();
        this.onMessage = this._onMessage.event;
        this._disposed = false;
        this.firstInit = true;
        this.nonce = UUID.generateUuid();
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
    updateOptions(options) {
        this.options = options;
        this._updateStyles();
        this._updateOptions();
    }
    _logRendererDebugMessage(msg) {
        this.notebookLogService.debug('BacklayerWebview', `${this.documentUri} (${this.id}) - ${msg}`);
    }
    _updateStyles() {
        this._sendMessageToWebview({
            type: 'notebookStyles',
            styles: this._generateStyles()
        });
    }
    _updateOptions() {
        this._sendMessageToWebview({
            type: 'notebookOptions',
            options: {
                dragAndDropEnabled: this.options.dragAndDropEnabled
            },
            renderOptions: {
                lineLimit: this.options.outputLineLimit,
                outputScrolling: this.options.outputScrolling,
                outputWordWrap: this.options.outputWordWrap,
                linkifyFilePaths: this.options.outputLinkifyFilePaths,
                minimalError: this.options.minimalError
            }
        });
    }
    _generateStyles() {
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
            'notebook-markdown-line-height': typeof this.options.markdownLineHeight === 'number' && this.options.markdownLineHeight > 0 ? `${this.options.markdownLineHeight}px` : `normal`,
            'notebook-cell-output-font-size': `${this.options.outputFontSize || this.options.fontSize}px`,
            'notebook-cell-output-line-height': `${this.options.outputLineHeight}px`,
            'notebook-cell-output-max-height': `${this.options.outputLineHeight * this.options.outputLineLimit + 2}px`,
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
            'notebook-markup-font-family': this.options.markupFontFamily,
        };
    }
    generateContent(baseUrl) {
        const renderersData = this.getRendererData();
        const preloadsData = this.getStaticPreloadsData();
        const renderOptions = {
            lineLimit: this.options.outputLineLimit,
            outputScrolling: this.options.outputScrolling,
            outputWordWrap: this.options.outputWordWrap,
            linkifyFilePaths: this.options.outputLinkifyFilePaths,
            minimalError: this.options.minimalError
        };
        const preloadScript = preloadsScriptStr({
            ...this.options,
            tokenizationCss: getTokenizationCss(),
        }, { dragAndDropEnabled: this.options.dragAndDropEnabled }, renderOptions, renderersData, preloadsData, this.workspaceTrustManagementService.isWorkspaceTrusted(), this.nonce);
        const enableCsp = this.configurationService.getValue('notebook.experimental.enableCsp');
        const currentHighlight = this.getColor(editorFindMatch);
        const findMatchHighlight = this.getColor(editorFindMatchHighlight);
        return /* html */ `
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

					#container .cell_container.nb-insertHighlight div.output_container div.output {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
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
						line-height: var(--notebook-markdown-line-height);
						color: var(--theme-ui-foreground);
						font-family: var(--notebook-markup-font-family);
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

					#container .markup > div.nb-insertHighlight {
						background-color: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
					}

					#container .nb-symbolHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .markup > div.nb-multiCellHighlight {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-multiCellHighlight .output_container .output {
						background-color: var(--theme-notebook-symbol-highlight-background);
					}

					#container .nb-chatGenerationHighlight .output_container .output {
						background-color: var(--vscode-notebook-selectedCellBackground);
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
						border: none;
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
    getRendererData() {
        return this.notebookService.getRenderers().map((renderer) => {
            const entrypoint = {
                extends: renderer.entrypoint.extends,
                path: this.asWebviewUri(renderer.entrypoint.path, renderer.extensionLocation).toString()
            };
            return {
                id: renderer.id,
                entrypoint,
                mimeTypes: renderer.mimeTypes,
                messaging: renderer.messaging !== "never" /* RendererMessagingSpec.Never */ && !!this.rendererMessaging,
                isBuiltin: renderer.isBuiltin
            };
        });
    }
    getStaticPreloadsData() {
        return Array.from(this.notebookService.getStaticPreloads(this.notebookViewType), preload => {
            return { entrypoint: this.asWebviewUri(preload.entrypoint, preload.extensionLocation).toString().toString() };
        });
    }
    asWebviewUri(uri, fromExtension) {
        return asWebviewUri(uri, fromExtension?.scheme === Schemas.vscodeRemote ? { isRemote: true, authority: fromExtension.authority } : undefined);
    }
    postKernelMessage(message) {
        this._sendMessageToWebview({
            __vscode_notebook_message: true,
            type: 'customKernelMessage',
            message,
        });
    }
    resolveOutputId(id) {
        const output = this.reversedInsetMapping.get(id);
        if (!output) {
            return;
        }
        const cellInfo = this.insetMapping.get(output).cellInfo;
        return { cellInfo, output };
    }
    isResolved() {
        return !!this.webview;
    }
    createWebview(targetWindow) {
        const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), undefined);
        const htmlContent = this.generateContent(baseUrl.toString());
        return this._initialize(htmlContent, targetWindow);
    }
    getNotebookBaseUri() {
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
    getBuiltinLocalResourceRoots() {
        // Python notebooks assume that requirejs is a global.
        // For all other notebooks, they need to provide their own loader.
        if (!this.documentUri.path.toLowerCase().endsWith('.ipynb')) {
            return [];
        }
        if (isWeb) {
            return []; // script is inlined
        }
        return [
            dirname(FileAccess.asFileUri('vs/nls.js')),
        ];
    }
    _initialize(content, targetWindow) {
        if (!getWindow(this.element).document.body.contains(this.element)) {
            throw new Error('Element is already detached from the DOM tree');
        }
        this.webview = this._createInset(this.webviewService, content);
        this.webview.mountTo(this.element, targetWindow);
        this._register(this.webview);
        this._register(new WebviewWindowDragMonitor(targetWindow, () => this.webview));
        const initializePromise = new DeferredPromise();
        this._register(this.webview.onFatalError(e => {
            initializePromise.error(new Error(`Could not initialize webview: ${e.message}}`));
        }));
        this._register(this.webview.onMessage(async (message) => {
            const data = message.message;
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
                            }
                            else if (update.init) {
                                // might be idle render request's ack
                                const outputRequest = this.reversedPendingWebviewIdleInsetMapping.get(update.id);
                                if (outputRequest) {
                                    const inset = this.pendingWebviewIdleInsetMapping.get(outputRequest);
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
                                const inset = this.insetMapping.get(output);
                                inset.initialized = true;
                            }
                        }
                        else {
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
                            this.notebookEditor.focusNotebookCell(latestCell, 'output', { outputId: resolvedResult.output.model.outputId, skipReveal: true, outputWebviewFocused: true });
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
                            latestCell.inputInOutputIsFocused = false;
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
                        }
                        else {
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
                            this.openerService.open(CellUri.generateCellOutputUriWithId(this.documentUri, outputId));
                            return;
                        }
                        if (uri.path === 'cellOutput.enableScrolling') {
                            const outputId = uri.query;
                            const cell = this.reversedInsetMapping.get(outputId);
                            if (cell) {
                                this.telemetryService.publicLog2('workbenchActionExecuted', { id: 'notebook.cell.toggleOutputScrolling', from: 'inlineLink' });
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
                                'jupyter.viewOutput',
                                'jupyter.createPythonEnvAndSelectController',
                            ],
                        });
                        return;
                    }
                    if (matchesSomeScheme(data.href, Schemas.http, Schemas.https, Schemas.mailto)) {
                        this.openerService.open(data.href, { fromUserGesture: true, fromWorkspace: true });
                    }
                    else if (matchesScheme(data.href, Schemas.vscodeNotebookCell)) {
                        const uri = URI.parse(data.href);
                        await this._handleNotebookCellResource(uri);
                    }
                    else if (!/^[\w\-]+:/.test(data.href)) {
                        // Uri without scheme, such as a file path
                        await this._handleResourceOpening(tryDecodeURIComponent(data.href));
                    }
                    else {
                        // uri with scheme
                        if (osPath.isAbsolute(data.href)) {
                            this._openUri(URI.file(data.href));
                        }
                        else {
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
                        }
                        else {
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
                    if (data.outputSize && data.rendererId === 'vscode.builtin-renderer') {
                        this._sendPerformanceData(data.outputSize, data.duration);
                    }
                    break;
                }
                case 'outputInputFocus': {
                    const resolvedResult = this.resolveOutputId(data.id);
                    if (resolvedResult) {
                        const latestCell = this.notebookEditor.getCellByInfo(resolvedResult.cellInfo);
                        if (latestCell) {
                            latestCell.inputInOutputIsFocused = data.inputFocused;
                        }
                    }
                    this.notebookEditor.didFocusOutputInputChange(data.inputFocused);
                }
            }
        }));
        return initializePromise.p;
    }
    _sendPerformanceData(outputSize, renderTime) {
        const telemetryData = {
            outputSize,
            renderTime
        };
        this.telemetryService.publicLog2('NotebookCellOutputRender', telemetryData);
    }
    _handleNotebookCellResource(uri) {
        const notebookResource = uri.path.length > 0 ? uri : this.documentUri;
        const lineMatch = /(?:^|&)line=([^&]+)/.exec(uri.query);
        let editorOptions = undefined;
        if (lineMatch) {
            const parsedLineNumber = parseInt(lineMatch[1], 10);
            if (!isNaN(parsedLineNumber)) {
                const lineNumber = parsedLineNumber;
                editorOptions = {
                    selection: { startLineNumber: lineNumber, startColumn: 1 }
                };
            }
        }
        const executionMatch = /(?:^|&)execution_count=([^&]+)/.exec(uri.query);
        if (executionMatch) {
            const executionCount = parseInt(executionMatch[1], 10);
            if (!isNaN(executionCount)) {
                const notebookModel = this.notebookService.getNotebookTextModel(notebookResource);
                // multiple cells with the same execution count can exist if the kernel is restarted
                // so look for the most recently added cell with the matching execution count.
                // Somewhat more likely to be correct in notebooks, an much more likely for the interactive window
                const cell = notebookModel?.cells.slice().reverse().find(cell => {
                    return cell.internalMetadata.executionOrder === executionCount;
                });
                if (cell?.uri) {
                    return this.openerService.open(cell.uri, {
                        fromUserGesture: true,
                        fromWorkspace: true,
                        editorOptions: editorOptions
                    });
                }
            }
        }
        // URLs built by the jupyter extension put the line query param in the fragment
        // They also have the cell fragment pre-calculated
        const fragmentLineMatch = /\?line=(\d+)$/.exec(uri.fragment);
        if (fragmentLineMatch) {
            const parsedLineNumber = parseInt(fragmentLineMatch[1], 10);
            if (!isNaN(parsedLineNumber)) {
                const lineNumber = parsedLineNumber + 1;
                const fragment = uri.fragment.substring(0, fragmentLineMatch.index);
                // open the uri with selection
                const editorOptions = {
                    selection: { startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: 1 }
                };
                return this.openerService.open(notebookResource.with({ fragment }), {
                    fromUserGesture: true,
                    fromWorkspace: true,
                    editorOptions: editorOptions
                });
            }
        }
        return this.openerService.open(notebookResource, { fromUserGesture: true, fromWorkspace: true });
    }
    async _handleResourceOpening(href) {
        let linkToOpen = undefined;
        let fragment = undefined;
        // Separate out the fragment so that the subsequent calls
        // to URI.joinPath() don't URL encode it. This allows opening
        // links with both paths and fragments.
        const hrefWithFragment = FRAGMENT_REGEX.exec(href);
        if (hrefWithFragment) {
            href = hrefWithFragment[1];
            fragment = hrefWithFragment[2];
        }
        if (href.startsWith('/')) {
            linkToOpen = await this.pathService.fileURI(href);
            const folders = this.workspaceContextService.getWorkspace().folders;
            if (folders.length) {
                linkToOpen = linkToOpen.with({
                    scheme: folders[0].uri.scheme,
                    authority: folders[0].uri.authority
                });
            }
        }
        else if (href.startsWith('~')) {
            const userHome = await this.pathService.userHome();
            if (userHome) {
                linkToOpen = URI.joinPath(userHome, href.substring(2));
            }
        }
        else {
            if (this.documentUri.scheme === Schemas.untitled) {
                const folders = this.workspaceContextService.getWorkspace().folders;
                if (!folders.length) {
                    return;
                }
                linkToOpen = URI.joinPath(folders[0].uri, href);
            }
            else {
                // Resolve relative to notebook document
                linkToOpen = URI.joinPath(dirname(this.documentUri), href);
            }
        }
        if (linkToOpen) {
            // Re-attach fragment now that we have the full file path.
            if (fragment) {
                linkToOpen = linkToOpen.with({ fragment });
            }
            this._openUri(linkToOpen);
        }
    }
    _openUri(uri) {
        let lineNumber = undefined;
        let column = undefined;
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
        let match = undefined;
        for (const group of this.editorGroupService.groups) {
            const editorInput = group.editors.find(editor => editor.resource && isEqual(editor.resource, uri, true));
            if (editorInput) {
                match = { group, editor: editorInput };
                break;
            }
        }
        if (match) {
            const selection = lineNumber !== undefined && column !== undefined ? { startLineNumber: lineNumber, startColumn: column } : undefined;
            const textEditorOptions = { selection: selection };
            match.group.openEditor(match.editor, selection ? textEditorOptions : undefined);
        }
        else {
            this.openerService.open(uri, { fromUserGesture: true, fromWorkspace: true });
        }
    }
    _handleHighlightCodeBlock(codeBlocks) {
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
    async _onDidClickDataLink(event) {
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
        let defaultName;
        if (event.downloadName) {
            defaultName = event.downloadName;
        }
        else {
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
    _createInset(webviewService, content) {
        this.localResourceRootsCache = this._getResourceRootsCache();
        const webview = webviewService.createWebviewElement({
            origin: BackLayerWebView_1.getOriginStore(this.storageService).getOrigin(this.notebookViewType, undefined),
            title: nls.localize('webview title', "Notebook webview content"),
            options: {
                purpose: "notebookRenderer" /* WebviewContentPurpose.NotebookRenderer */,
                enableFindWidget: false,
                transformCssVariables: transformWebviewThemeVars,
            },
            contentOptions: {
                allowMultipleAPIAcquire: true,
                allowScripts: true,
                localResourceRoots: this.localResourceRootsCache,
            },
            extension: undefined,
            providedViewType: 'notebook.output'
        });
        webview.setHtml(content);
        webview.setContextKeyService(this.contextKeyService);
        return webview;
    }
    _getResourceRootsCache() {
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
    initializeWebViewState() {
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
        }
        else {
            const mdCells = [...this.markupPreviewMapping.values()];
            this.markupPreviewMapping.clear();
            this.initializeMarkup(mdCells);
        }
        this._updateStyles();
        this._updateOptions();
    }
    shouldUpdateInset(cell, output, cellTop, outputOffset) {
        if (this._disposed) {
            return false;
        }
        if ('isOutputCollapsed' in cell && cell.isOutputCollapsed) {
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
    ackHeight(updates) {
        this._sendMessageToWebview({
            type: 'ack-dimension',
            updates
        });
    }
    updateScrollTops(outputRequests, markupPreviews) {
        if (this._disposed) {
            return;
        }
        const widgets = coalesce(outputRequests.map((request) => {
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
    async createMarkupPreview(initialization) {
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
    async showMarkupPreview(newContent) {
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
    async hideMarkupPreviews(cellIds) {
        if (this._disposed) {
            return;
        }
        const cellsToHide = [];
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
    async unhideMarkupPreviews(cellIds) {
        if (this._disposed) {
            return;
        }
        const toUnhide = [];
        for (const cellId of cellIds) {
            const entry = this.markupPreviewMapping.get(cellId);
            if (entry) {
                if (!entry.visible) {
                    entry.visible = true;
                    toUnhide.push(cellId);
                }
            }
            else {
                console.error(`Trying to unhide a preview that does not exist: ${cellId}`);
            }
        }
        this._sendMessageToWebview({
            type: 'unhideMarkupCells',
            ids: toUnhide,
        });
    }
    async deleteMarkupPreviews(cellIds) {
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
    async updateMarkupPreviewSelections(selectedCellsIds) {
        if (this._disposed) {
            return;
        }
        this._sendMessageToWebview({
            type: 'updateSelectedMarkupCells',
            selectedCellIds: selectedCellsIds.filter(id => this.markupPreviewMapping.has(id)),
        });
    }
    async initializeMarkup(cells) {
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
    _cachedInsetEqual(cachedInset, content) {
        if (content.type === 1 /* RenderOutputType.Extension */) {
            // Use a new renderer
            return cachedInset.renderer?.id === content.renderer.id;
        }
        else {
            // The new renderer is the default HTML renderer
            return cachedInset.cachedCreation.type === 'html';
        }
    }
    requestCreateOutputWhenWebviewIdle(cellInfo, content, cellTop, offset) {
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
        this.pendingWebviewIdleCreationRequest.set(content.source, runWhenGlobalIdle(() => {
            const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, true, true);
            this._sendMessageToWebview(message, transferable);
            this.pendingWebviewIdleInsetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo: cellInfo, renderer, cachedCreation: message });
            this.reversedPendingWebviewIdleInsetMapping.set(message.outputId, content.source);
            this.pendingWebviewIdleCreationRequest.delete(content.source);
        }));
    }
    createOutput(cellInfo, content, cellTop, offset) {
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
        const { message, renderer, transfer: transferable } = this._createOutputCreationMessage(cellInfo, content, cellTop, offset, false, false);
        this._sendMessageToWebview(message, transferable);
        this.insetMapping.set(content.source, { outputId: message.outputId, versionId: content.source.model.versionId, cellInfo: cellInfo, renderer, cachedCreation: message });
        this.hiddenInsetMapping.delete(content.source);
        this.reversedInsetMapping.set(message.outputId, content.source);
    }
    createMetadata(output, mimeType) {
        if (mimeType.startsWith('image')) {
            const buffer = output.outputs.find(out => out.mime === 'text/plain')?.data.buffer;
            if (buffer?.length && buffer?.length > 0) {
                const altText = new TextDecoder().decode(buffer);
                return { ...output.metadata, vscode_altText: altText };
            }
        }
        return output.metadata;
    }
    _createOutputCreationMessage(cellInfo, content, cellTop, offset, createOnIdle, initiallyHidden) {
        const messageBase = {
            type: 'html',
            executionId: cellInfo.executionId,
            cellId: cellInfo.cellId,
            cellTop: cellTop,
            outputOffset: offset,
            left: 0,
            requiredPreloads: [],
            createOnIdle: createOnIdle
        };
        const transfer = [];
        let message;
        let renderer;
        if (content.type === 1 /* RenderOutputType.Extension */) {
            const output = content.source.model;
            renderer = content.renderer;
            const first = output.outputs.find(op => op.mime === content.mimeType);
            const metadata = this.createMetadata(output, content.mimeType);
            const valueBytes = copyBufferIfNeeded(first.data.buffer, transfer);
            message = {
                ...messageBase,
                outputId: output.outputId,
                rendererId: content.renderer.id,
                content: {
                    type: 1 /* RenderOutputType.Extension */,
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
        }
        else {
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
    updateOutput(cellInfo, content, cellTop, offset) {
        if (this._disposed) {
            return;
        }
        if (!this.insetMapping.has(content.source)) {
            this.createOutput(cellInfo, content, cellTop, offset);
            return;
        }
        const outputCache = this.insetMapping.get(content.source);
        if (outputCache.versionId === content.source.model.versionId) {
            // already sent this output version to the renderer
            return;
        }
        this.hiddenInsetMapping.delete(content.source);
        let updatedContent = undefined;
        const transfer = [];
        if (content.type === 1 /* RenderOutputType.Extension */) {
            const output = content.source.model;
            const firstBuffer = output.outputs.find(op => op.mime === content.mimeType);
            const appenededData = output.appendedSinceVersion(outputCache.versionId, content.mimeType);
            const appended = appenededData ? { valueBytes: appenededData.buffer, previousVersion: outputCache.versionId } : undefined;
            const valueBytes = copyBufferIfNeeded(firstBuffer.data.buffer, transfer);
            updatedContent = {
                type: 1 /* RenderOutputType.Extension */,
                outputId: outputCache.outputId,
                metadata: output.metadata,
                output: {
                    mime: content.mimeType,
                    valueBytes,
                    appended: appended
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
    async copyImage(output) {
        // Collect text alternates from the same cell output
        const textAlternates = [];
        const cellOutput = output.model;
        for (const outputItem of cellOutput.outputs) {
            if (TEXT_BASED_MIMETYPES.includes(outputItem.mime)) {
                const text = isTextStreamMime(outputItem.mime) ?
                    getOutputStreamText(output).text :
                    getOutputText(outputItem.mime, outputItem);
                textAlternates.push({
                    mimeType: outputItem.mime,
                    content: text
                });
            }
        }
        this._sendMessageToWebview({
            type: 'copyImage',
            outputId: output.model.outputId,
            altOutputId: output.model.alternativeOutputId,
            textAlternates: textAlternates.length > 0 ? textAlternates : undefined
        });
    }
    removeInsets(outputs) {
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
    hideInset(output) {
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
    selectOutputContents(cell) {
        if (this._disposed) {
            return;
        }
        const output = cell.outputsViewModels.find(o => o.model.outputId === cell.focusedOutputId);
        const outputId = output ? this.insetMapping.get(output)?.outputId : undefined;
        this._sendMessageToWebview({
            type: 'select-output-contents',
            cellOrOutputId: outputId || cell.id
        });
    }
    selectInputContents(cell) {
        if (this._disposed) {
            return;
        }
        const output = cell.outputsViewModels.find(o => o.model.outputId === cell.focusedOutputId);
        const outputId = output ? this.insetMapping.get(output)?.outputId : undefined;
        this._sendMessageToWebview({
            type: 'select-input-contents',
            cellOrOutputId: outputId || cell.id
        });
    }
    focusOutput(cellOrOutputId, alternateId, viewFocused) {
        if (this._disposed) {
            return;
        }
        if (!viewFocused) {
            this.webview?.focus();
        }
        this._sendMessageToWebview({
            type: 'focus-output',
            cellOrOutputId: cellOrOutputId,
            alternateId: alternateId
        });
    }
    blurOutput() {
        if (this._disposed) {
            return;
        }
        this._sendMessageToWebview({
            type: 'blur-output'
        });
    }
    async find(query, options) {
        if (query === '') {
            this._sendMessageToWebview({
                type: 'findStop',
                ownerID: options.ownerID
            });
            return [];
        }
        const p = new Promise(resolve => {
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
    findStop(ownerID) {
        this._sendMessageToWebview({
            type: 'findStop',
            ownerID
        });
    }
    async findHighlightCurrent(index, ownerID) {
        const p = new Promise(resolve => {
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
    async findUnHighlightCurrent(index, ownerID) {
        this._sendMessageToWebview({
            type: 'findUnHighlightCurrent',
            index,
            ownerID
        });
    }
    deltaCellOutputContainerClassNames(cellId, added, removed) {
        this._sendMessageToWebview({
            type: 'decorations',
            cellId,
            addedClassNames: added,
            removedClassNames: removed
        });
    }
    deltaMarkupPreviewClassNames(cellId, added, removed) {
        if (this.markupPreviewMapping.get(cellId)) {
            this._sendMessageToWebview({
                type: 'markupDecorations',
                cellId,
                addedClassNames: added,
                removedClassNames: removed
            });
        }
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
    async updateKernelPreloads(kernel) {
        if (this._disposed || kernel === this._currentKernel) {
            return;
        }
        const previousKernel = this._currentKernel;
        this._currentKernel = kernel;
        if (previousKernel && previousKernel.preloadUris.length > 0) {
            this.webview?.reload(); // preloads will be restored after reload
        }
        else if (kernel) {
            this._updatePreloadsFromKernel(kernel);
        }
    }
    _updatePreloadsFromKernel(kernel) {
        const resources = [];
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
    _updatePreloads(resources) {
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
    _sendMessageToWebview(message, transfer) {
        if (this._disposed) {
            return;
        }
        this.webview?.postMessage(message, transfer);
    }
    dispose() {
        this._disposed = true;
        this.webview?.dispose();
        this.webview = undefined;
        this.notebookEditor = null;
        this.insetMapping.clear();
        this.pendingWebviewIdleCreationRequest.clear();
        super.dispose();
    }
};
BackLayerWebView = BackLayerWebView_1 = __decorate([
    __param(6, IWebviewService),
    __param(7, IOpenerService),
    __param(8, INotebookService),
    __param(9, IWorkspaceContextService),
    __param(10, IWorkbenchEnvironmentService),
    __param(11, IFileDialogService),
    __param(12, IFileService),
    __param(13, IContextMenuService),
    __param(14, IContextKeyService),
    __param(15, IWorkspaceTrustManagementService),
    __param(16, IConfigurationService),
    __param(17, ILanguageService),
    __param(18, IWorkspaceContextService),
    __param(19, IEditorGroupsService),
    __param(20, IStorageService),
    __param(21, IPathService),
    __param(22, INotebookLoggingService),
    __param(23, IThemeService),
    __param(24, ITelemetryService)
], BackLayerWebView);
export { BackLayerWebView };
function copyBufferIfNeeded(buffer, transfer) {
    if (buffer.byteLength === buffer.buffer.byteLength) {
        // No copy needed but we can't transfer either
        return buffer;
    }
    else {
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
function tryDecodeURIComponent(uri) {
    try {
        return decodeURIComponent(uri);
    }
    catch {
        return uri;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja0xheWVyV2ViVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9yZW5kZXJlcnMvYmFja0xheWVyV2ViVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBSWxFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsZUFBZSxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSx3Q0FBd0MsQ0FBQztBQUV4RSxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNsRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxhQUFhLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNqSCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEUsT0FBTyxLQUFLLE1BQU0sTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUNqRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0QsT0FBTyxLQUFLLElBQUksTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsb0JBQW9C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