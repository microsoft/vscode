/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseWheelEvent } from 'vs/base/browser/mouseEvent';
import { IAction } from 'vs/base/common/actions';
import { coalesce } from 'vs/base/common/arrays';
import { decodeBase64 } from 'vs/base/common/buffer';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { getExtensionForMimeType } from 'vs/base/common/mime';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { isMacintosh, isWeb } from 'vs/base/common/platform';
import { dirname, joinPath } from 'vs/base/common/resources';
import { equals } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { generateTokensCSSForColorMap } from 'vs/editor/common/languages/supports/tokenization';
import { tokenizeToString } from 'vs/editor/common/languages/textToHtmlTokenizer';
import * as nls from 'vs/nls';
import { createAndFillInContextMenuActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IFileDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService, matchesScheme, matchesSomeScheme } from 'vs/platform/opener/common/opener';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { asWebviewUri, webviewGenericCspSource } from 'vs/workbench/common/webview';
import { CellEditState, ICellOutputViewModel, ICellViewModel, ICommonCellInfo, IDisplayOutputLayoutUpdateRequest, IDisplayOutputViewModel, IFocusNotebookCellOptions, IGenericCellViewModel, IInsetRenderOutput, INotebookEditorCreationOptions, INotebookWebviewMessage, RenderOutputType } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NOTEBOOK_WEBVIEW_BOUNDARY } from 'vs/workbench/contrib/notebook/browser/view/notebookCellList';
import { preloadsScriptStr } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewPreloads';
import { transformWebviewThemeVars } from 'vs/workbench/contrib/notebook/browser/view/renderers/webviewThemeMapping';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellUri, INotebookRendererInfo, NotebookSetting, RendererMessagingSpec } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernel } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { IScopedRendererMessaging } from 'vs/workbench/contrib/notebook/common/notebookRendererMessagingService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { IWebviewElement, IWebviewService, WebviewContentPurpose } from 'vs/workbench/contrib/webview/browser/webview';
import { WebviewWindowDragMonitor } from 'vs/workbench/contrib/webview/browser/webviewWindowDragMonitor';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { FromWebviewMessage, IAckOutputHeight, IClickedDataUrlMessage, ICodeBlockHighlightRequest, IContentWidgetTopRequest, IControllerPreload, ICreationContent, ICreationRequestMessage, IFindMatch, IMarkupCellInitialization, RendererMetadata, ToWebviewMessage } from './webviewMessages';

export interface ICachedInset<K extends ICommonCellInfo> {
	outputId: string;
	cellInfo: K;
	renderer?: INotebookRendererInfo;
	cachedCreation: ICreationRequestMessage;
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
}

export class BackLayerWebView<T extends ICommonCellInfo> extends Disposable {
	element: HTMLElement;
	webview: IWebviewElement | undefined = undefined;
	insetMapping: Map<IDisplayOutputViewModel, ICachedInset<T>> = new Map();
	readonly markupPreviewMapping = new Map<string, IMarkupCellInitialization>();
	private hiddenInsetMapping: Set<IDisplayOutputViewModel> = new Set();
	private reversedInsetMapping: Map<string, IDisplayOutputViewModel> = new Map();
	private localResourceRootsCache: URI[] | undefined = undefined;
	private readonly _onMessage = this._register(new Emitter<INotebookWebviewMessage>());
	private readonly _preloadsCache = new Set<string>();
	public readonly onMessage: Event<INotebookWebviewMessage> = this._onMessage.event;
	private _initialized?: Promise<void>;
	private _disposed = false;
	private _currentKernel?: INotebookKernel;

	private readonly nonce = UUID.generateUuid();

	constructor(
		public notebookEditor: INotebookDelegateForWebview,
		public readonly id: string,
		public readonly documentUri: URI,
		private options: BacklayerWebviewOptions,
		private readonly rendererMessaging: IScopedRendererMessaging | undefined,
		@IWebviewService readonly webviewService: IWebviewService,
		@IOpenerService readonly openerService: IOpenerService,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IFileService private readonly fileService: IFileService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
	) {
		super();

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
			this._sendMessageToWebview({
				type: 'updateWorkspaceTrust',
				isTrusted: e,
			});
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
			'notebook-cell-output-font-family': this.options.outputFontFamily || this.options.fontFamily,
			'notebook-cell-markup-empty-content': nls.localize('notebook.emptyMarkdownPlaceholder', "Empty markdown cell, double click or press enter to edit."),
			'notebook-cell-renderer-not-found-error': nls.localize({
				key: 'notebook.error.rendererNotFound',
				comment: ['$0 is a placeholder for the mime type']
			}, "No renderer found for '$0' a"),
		};
	}

	private generateContent(coreDependencies: string, baseUrl: string) {
		const renderersData = this.getRendererData();
		const preloadScript = preloadsScriptStr(
			this.options,
			{ dragAndDropEnabled: this.options.dragAndDropEnabled },
			renderersData,
			this.workspaceTrustManagementService.isWorkspaceTrusted(),
			this.configurationService.getValue<number>(NotebookSetting.textOutputLineLimit) ?? 30,
			this.nonce);

		const enableCsp = this.configurationService.getValue('notebook.experimental.enableCsp');
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
						background-color: var(--vscode-editor-findMatchHighlightBackground);
					}

					::highlight(current-find-highlight) {
						background-color: var(--vscode-editor-findMatchBackground);
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
						padding-top: var(--notebook-output-node-padding);
						padding-right: var(--notebook-output-node-padding);
						padding-bottom: var(--notebook-output-node-padding);
						padding-left: var(--notebook-output-node-left-padding);
						box-sizing: border-box;
						border-top: none !important;
						border: 1px solid var(--theme-notebook-output-border);
						background-color: var(--theme-notebook-output-background);
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
				<style id="vscode-tokenization-styles" nonce="${this.nonce}">${getTokenizationCss()}</style>
			</head>
			<body style="overflow: hidden;">
				<script>
					self.require = {};
				</script>
				${coreDependencies}
				<div id='findStart' tabIndex=-1></div>
				<div id='container' class="widgetarea" style="position: absolute;width:100%;top: 0px"></div>
				<script type="module">${preloadScript}</script>
				<div id="container" class="widgetarea" style="position: absolute; width:100%; top: 0px"></div>
				<div id="_defaultColorPalatte"></div>
			</body>
		</html>`;
	}

	private getRendererData(): RendererMetadata[] {
		return this.notebookService.getRenderers().map((renderer): RendererMetadata => {
			const entrypoint = this.asWebviewUri(renderer.entrypoint, renderer.extensionLocation).toString();
			return {
				id: renderer.id,
				entrypoint,
				mimeTypes: renderer.mimeTypes,
				extends: renderer.extends,
				messaging: renderer.messaging !== RendererMessagingSpec.Never,
				isBuiltin: renderer.isBuiltin
			};
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

	async createWebview(): Promise<void> {
		const baseUrl = this.asWebviewUri(this.getNotebookBaseUri(), undefined);

		// Python notebooks assume that requirejs is a global.
		// For all other notebooks, they need to provide their own loader.
		if (!this.documentUri.path.toLowerCase().endsWith('.ipynb')) {
			const htmlContent = this.generateContent('', baseUrl.toString());
			this._initialize(htmlContent);
			return;
		}

		let coreDependencies = '';
		let resolveFunc: () => void;

		this._initialized = new Promise<void>((resolve) => {
			resolveFunc = resolve;
		});

		if (!isWeb) {
			const loaderUri = FileAccess.asFileUri('vs/loader.js', require);
			const loader = this.asWebviewUri(loaderUri, undefined);

			coreDependencies = `<script src="${loader}"></script><script>
			var requirejs = (function() {
				return require;
			}());
			</script>`;
			const htmlContent = this.generateContent(coreDependencies, baseUrl.toString());
			this._initialize(htmlContent);
			resolveFunc!();
		} else {
			const loaderUri = FileAccess.asBrowserUri('vs/loader.js', require);

			fetch(loaderUri.toString(true)).then(async response => {
				if (response.status !== 200) {
					throw new Error(response.statusText);
				}

				const loaderJs = await response.text();

				coreDependencies = `
<script>
${loaderJs}
</script>
<script>
var requirejs = (function() {
	return require;
}());
</script>
`;

				const htmlContent = this.generateContent(coreDependencies, baseUrl.toString());
				this._initialize(htmlContent);
				resolveFunc!();
			}, error => {
				// the fetch request is rejected
				const htmlContent = this.generateContent(coreDependencies, baseUrl.toString());
				this._initialize(htmlContent);
				resolveFunc!();
			});
		}

		await this._initialized;
	}

	private getNotebookBaseUri() {
		if (this.documentUri.scheme === Schemas.untitled || this.documentUri.scheme === Schemas.vscodeInteractive) {
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
			dirname(FileAccess.asFileUri('vs/loader.js', require)),
		];
	}

	private _initialize(content: string) {
		if (!document.body.contains(this.element)) {
			throw new Error('Element is already detached from the DOM tree');
		}

		this.webview = this._createInset(this.webviewService, content);
		this.webview.mountTo(this.element);
		this._register(this.webview);

		this._register(new WebviewWindowDragMonitor(() => this.webview));

		this._register(this.webview.onDidClickLink(link => {
			if (this._disposed) {
				return;
			}

			if (!link) {
				return;
			}

			if (matchesScheme(link, Schemas.command)) {
				const ret = /command\:workbench\.action\.openLargeOutput\?(.*)/.exec(link);
				if (ret && ret.length === 2) {
					const outputId = ret[1];
					this.openerService.open(CellUri.generateCellOutputUri(this.documentUri, outputId));
					return;
				}
				console.warn('Command links are deprecated and will be removed, use message passing instead: https://github.com/microsoft/vscode/issues/123601');
			}

			if (matchesScheme(link, Schemas.command)) {
				if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
					this.openerService.open(link, { fromUserGesture: true, allowContributedOpeners: true, allowCommands: true });
				} else {
					console.warn('Command links are disabled in untrusted workspaces');
				}
			} else if (matchesSomeScheme(link, Schemas.vscodeNotebookCell, Schemas.http, Schemas.https, Schemas.mailto)) {
				this.openerService.open(link, { fromUserGesture: true, allowContributedOpeners: true, allowCommands: true });
			}
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
					this.initializeWebViewState();
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
					let linkToOpen: URI | string | undefined;
					if (matchesScheme(data.href, Schemas.command)) {
						const ret = /command\:workbench\.action\.openLargeOutput\?(.*)/.exec(data.href);
						if (ret && ret.length === 2) {
							const outputId = ret[1];
							const group = this.editorGroupService.activeGroup;

							if (group) {
								if (group.activeEditor) {
									group.pinEditor(group.activeEditor);
								}
							}

							this.openerService.open(CellUri.generateCellOutputUri(this.documentUri, outputId));
							return;
						}
					}
					if (matchesSomeScheme(data.href, Schemas.http, Schemas.https, Schemas.mailto, Schemas.command, Schemas.vscodeNotebookCell, Schemas.vscodeNotebook)) {
						linkToOpen = data.href;
					} else if (!/^[\w\-]+:/.test(data.href)) {
						const fragmentStartIndex = data.href.lastIndexOf('#');
						const path = decodeURI(fragmentStartIndex >= 0 ? data.href.slice(0, fragmentStartIndex) : data.href);
						if (this.documentUri.scheme === Schemas.untitled) {
							const folders = this.workspaceContextService.getWorkspace().folders;
							if (!folders.length) {
								return;
							}
							linkToOpen = URI.joinPath(folders[0].uri, path);
						} else {
							if (data.href.startsWith('/')) {
								// Resolve relative to workspace
								let folder = this.workspaceContextService.getWorkspaceFolder(this.documentUri);
								if (!folder) {
									const folders = this.workspaceContextService.getWorkspace().folders;
									if (!folders.length) {
										return;
									}
									folder = folders[0];
								}
								linkToOpen = URI.joinPath(folder.uri, path);
							} else {
								// Resolve relative to notebook document
								linkToOpen = URI.joinPath(dirname(this.documentUri), path);
							}
						}
					}

					if (linkToOpen) {
						this.openerService.open(linkToOpen, { fromUserGesture: true, allowCommands: true, fromWorkspace: true });
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
							getActions: () => {
								const result: IAction[] = [];
								const menu = this.menuService.createMenu(MenuId.NotebookCellTitle, this.contextKeyService);
								createAndFillInContextMenuActions(menu, undefined, result);
								menu.dispose();
								return result;
							},
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

				case 'outputResized':
					this.notebookEditor.didResizeOutput(data.cellId);
					break;
			}
		}));
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

		const defaultDir = this.documentUri.scheme === Schemas.vscodeInteractive ?
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
			id: this.id,
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

		webview.html = content;
		return webview;
	}

	private _getResourceRootsCache() {
		const workspaceFolders = this.contextService.getWorkspace().folders.map(x => x.uri);
		const notebookDir = this.getNotebookBaseUri();
		return [
			...this.notebookService.getNotebookProviderResourceRoots(),
			...this.notebookService.getRenderers().map(x => dirname(x.entrypoint)),
			...workspaceFolders,
			notebookDir,
			...this.getBuiltinLocalResourceRoots()
		];
	}

	private firstInit = true;

	private initializeWebViewState() {
		this._preloadsCache.clear();
		if (this._currentKernel) {
			this._updatePreloadsFromKernel(this._currentKernel);
		}

		for (const [output, inset] of this.insetMapping.entries()) {
			this._sendMessageToWebview({ ...inset.cachedCreation, initiallyHidden: this.hiddenInsetMapping.has(output) });
		}

		if (this.firstInit) {
			// On first run the contents have already been initialized so we don't need to init them again
			this.firstInit = false;
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

		// TODO: use proper handler
		const p = new Promise<void>(resolve => {
			const sub = this.webview?.onMessage(e => {
				if (e.message.type === 'initializedMarkup') {
					resolve();
					sub?.dispose();
				}
			});
		});

		for (const cell of cells) {
			this.markupPreviewMapping.set(cell.cellId, cell);
		}

		this._sendMessageToWebview({
			type: 'initializeMarkup',
			cells,
		});

		await p;
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

	async createOutput(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number) {
		if (this._disposed) {
			return;
		}

		const cachedInset = this.insetMapping.get(content.source);

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

		const messageBase = {
			type: 'html',
			cellId: cellInfo.cellId,
			cellTop: cellTop,
			outputOffset: offset,
			left: 0,
			requiredPreloads: [],
		} as const;

		let message: ICreationRequestMessage;
		let renderer: INotebookRendererInfo | undefined;
		if (content.type === RenderOutputType.Extension) {
			const output = content.source.model;
			renderer = content.renderer;
			const first = output.outputs.find(op => op.mime === content.mimeType)!;

			// TODO@jrieken - the message can contain "bytes" and those are transferable
			// which improves IPC performance and therefore should be used. However, it does
			// means that the bytes cannot be used here anymore
			message = {
				...messageBase,
				outputId: output.outputId,
				rendererId: content.renderer.id,
				content: {
					type: RenderOutputType.Extension,
					outputId: output.outputId,
					mimeType: first.mime,
					valueBytes: first.data.buffer,
					metadata: output.metadata,
				},
			};
		} else {
			message = {
				...messageBase,
				outputId: UUID.generateUuid(),
				content: {
					type: content.type,
					htmlContent: content.htmlContent,
				}
			};
		}

		this._sendMessageToWebview(message);
		this.insetMapping.set(content.source, { outputId: message.outputId, cellInfo: cellInfo, renderer, cachedCreation: message });
		this.hiddenInsetMapping.delete(content.source);
		this.reversedInsetMapping.set(message.outputId, content.source);
	}

	async updateOutput(cellInfo: T, content: IInsetRenderOutput, cellTop: number, offset: number) {
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
		if (content.type === RenderOutputType.Extension) {
			const output = content.source.model;
			const first = output.outputs.find(op => op.mime === content.mimeType)!;
			updatedContent = {
				type: RenderOutputType.Extension,
				outputId: outputCache.outputId,
				mimeType: first.mime,
				valueBytes: first.data.buffer,
				metadata: output.metadata,
			};
		}

		this._sendMessageToWebview({
			type: 'showOutput',
			cellId: outputCache.cellInfo.cellId,
			outputId: outputCache.outputId,
			cellTop: cellTop,
			outputOffset: offset,
			content: updatedContent
		});
		return;
	}

	removeInsets(outputs: readonly ICellOutputViewModel[]) {
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
			this.reversedInsetMapping.delete(id);
		}
	}

	hideInset(output: ICellOutputViewModel) {
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

	async find(query: string, options: { wholeWord?: boolean; caseSensitive?: boolean; includeMarkup: boolean; includeOutput: boolean }): Promise<IFindMatch[]> {
		if (query === '') {
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

	findStop() {
		this._sendMessageToWebview({
			type: 'findStop'
		});
	}

	async findHighlight(index: number): Promise<number> {
		const p = new Promise<number>(resolve => {
			const sub = this.webview?.onMessage(e => {
				if (e.message.type === 'didFindHighlight') {
					resolve(e.message.offset);
					sub?.dispose();
				}
			});
		});

		this._sendMessageToWebview({
			type: 'findHighlight',
			index
		});

		const ret = await p;
		return ret;
	}

	async findUnHighlight(index: number): Promise<void> {
		this._sendMessageToWebview({
			type: 'findUnHighlight',
			index
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

	private _sendMessageToWebview(message: ToWebviewMessage) {
		if (this._disposed) {
			return;
		}

		this.webview?.postMessage(message);
	}

	override dispose() {
		this._disposed = true;
		this.webview?.dispose();
		this.webview = undefined;
		this.notebookEditor = null!;
		this.insetMapping.clear();
		super.dispose();
	}
}

function getTokenizationCss() {
	const colorMap = TokenizationRegistry.getColorMap();
	const tokenizationCss = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
	return tokenizationCss;
}

