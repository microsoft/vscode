"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownPreviewManager = void 0;
const vscode = __importStar(require("vscode"));
const dispose_1 = require("../util/dispose");
const file_1 = require("../util/file");
const preview_1 = require("./preview");
const previewConfig_1 = require("./previewConfig");
const scrolling_1 = require("./scrolling");
const topmostLineMonitor_1 = require("./topmostLineMonitor");
class PreviewStore extends dispose_1.Disposable {
    #previews = new Set();
    dispose() {
        super.dispose();
        for (const preview of this.#previews) {
            preview.dispose();
        }
        this.#previews.clear();
    }
    [Symbol.iterator]() {
        return this.#previews[Symbol.iterator]();
    }
    get(resource, previewSettings) {
        const previewColumn = this.#resolvePreviewColumn(previewSettings);
        for (const preview of this.#previews) {
            if (preview.matchesResource(resource, previewColumn, previewSettings.locked)) {
                return preview;
            }
        }
        return undefined;
    }
    add(preview) {
        this.#previews.add(preview);
    }
    delete(preview) {
        this.#previews.delete(preview);
    }
    #resolvePreviewColumn(previewSettings) {
        if (previewSettings.previewColumn === vscode.ViewColumn.Active) {
            return vscode.window.tabGroups.activeTabGroup.viewColumn;
        }
        if (previewSettings.previewColumn === vscode.ViewColumn.Beside) {
            return vscode.window.tabGroups.activeTabGroup.viewColumn + 1;
        }
        return previewSettings.previewColumn;
    }
}
class MarkdownPreviewManager extends dispose_1.Disposable {
    #topmostLineMonitor = new topmostLineMonitor_1.TopmostLineMonitor();
    #previewConfigurations = new previewConfig_1.MarkdownPreviewConfigurationManager();
    #dynamicPreviews = this._register(new PreviewStore());
    #staticPreviews = this._register(new PreviewStore());
    #activePreview = undefined;
    #contentProvider;
    #logger;
    #contributions;
    #opener;
    constructor(contentProvider, logger, contributions, opener) {
        super();
        this.#contentProvider = contentProvider;
        this.#logger = logger;
        this.#contributions = contributions;
        this.#opener = opener;
        this._register(vscode.window.registerWebviewPanelSerializer(preview_1.DynamicMarkdownPreview.viewType, this));
        this._register(vscode.window.registerCustomEditorProvider(preview_1.StaticMarkdownPreview.customEditorViewType, this, {
            webviewOptions: { enableFindWidget: true }
        }));
        this._register(vscode.window.onDidChangeActiveTextEditor(textEditor => {
            // When at a markdown file, apply existing scroll settings
            if (textEditor?.document && (0, file_1.isMarkdownFile)(textEditor.document)) {
                const line = this.#topmostLineMonitor.getPreviousStaticEditorLineByUri(textEditor.document.uri);
                if (typeof line === 'number') {
                    (0, scrolling_1.scrollEditorToLine)(line, textEditor);
                }
            }
        }));
    }
    refresh() {
        for (const preview of this.#dynamicPreviews) {
            preview.refresh();
        }
        for (const preview of this.#staticPreviews) {
            preview.refresh();
        }
    }
    updateConfiguration() {
        for (const preview of this.#dynamicPreviews) {
            preview.updateConfiguration();
        }
        for (const preview of this.#staticPreviews) {
            preview.updateConfiguration();
        }
    }
    openDynamicPreview(resource, settings) {
        let preview = this.#dynamicPreviews.get(resource, settings);
        if (preview) {
            preview.reveal(settings.previewColumn);
        }
        else {
            preview = this.#createNewDynamicPreview(resource, settings);
        }
        preview.update(resource, resource.fragment ? new scrolling_1.StartingScrollFragment(resource.fragment) : undefined);
    }
    get activePreviewResource() {
        return this.#activePreview?.resource;
    }
    get activePreviewResourceColumn() {
        return this.#activePreview?.resourceColumn;
    }
    findPreview(resource) {
        for (const preview of [...this.#dynamicPreviews, ...this.#staticPreviews]) {
            if (preview.resource.fsPath === resource.fsPath) {
                return preview;
            }
        }
        return undefined;
    }
    toggleLock() {
        const preview = this.#activePreview;
        if (preview instanceof preview_1.DynamicMarkdownPreview) {
            preview.toggleLock();
            // Close any previews that are now redundant, such as having two dynamic previews in the same editor group
            for (const otherPreview of this.#dynamicPreviews) {
                if (otherPreview !== preview && preview.matches(otherPreview)) {
                    otherPreview.dispose();
                }
            }
        }
    }
    openDocumentLink(linkText, fromResource) {
        const viewColumn = this.findPreview(fromResource)?.resourceColumn;
        return this.#opener.openDocumentLink(linkText, fromResource, viewColumn);
    }
    async deserializeWebviewPanel(webview, state) {
        try {
            const resource = vscode.Uri.parse(state.resource);
            const locked = state.locked;
            const line = state.line;
            const resourceColumn = state.resourceColumn;
            const preview = preview_1.DynamicMarkdownPreview.revive({ resource, locked, line, resourceColumn }, webview, this.#contentProvider, this.#previewConfigurations, this.#logger, this.#topmostLineMonitor, this.#contributions, this.#opener);
            this.#registerDynamicPreview(preview);
        }
        catch (e) {
            console.error(e);
            webview.webview.html = /* html */ `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!-- Disable pinch zooming -->
				<meta name="viewport"
					content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">

				<title>Markdown Preview</title>

				<style>
					html, body {
						min-height: 100%;
						height: 100%;
					}

					.error-container {
						display: flex;
						justify-content: center;
						align-items: center;
						text-align: center;
					}
				</style>

				<meta http-equiv="Content-Security-Policy" content="default-src 'none';">
			</head>
			<body class="error-container">
				<p>${vscode.l10n.t("An unexpected error occurred while restoring the Markdown preview.")}</p>
			</body>
			</html>`;
        }
    }
    async resolveCustomTextEditor(document, webview) {
        const lineNumber = this.#topmostLineMonitor.getPreviousStaticTextEditorLineByUri(document.uri);
        const preview = preview_1.StaticMarkdownPreview.revive(document.uri, webview, this.#contentProvider, this.#previewConfigurations, this.#topmostLineMonitor, this.#logger, this.#contributions, this.#opener, lineNumber);
        this.#registerStaticPreview(preview);
        this.#activePreview = preview;
    }
    #createNewDynamicPreview(resource, previewSettings) {
        const activeTextEditorURI = vscode.window.activeTextEditor?.document.uri;
        const scrollLine = (activeTextEditorURI?.toString() === resource.toString()) ? vscode.window.activeTextEditor?.visibleRanges[0].start.line : undefined;
        const preview = preview_1.DynamicMarkdownPreview.create({
            resource,
            resourceColumn: previewSettings.resourceColumn,
            locked: previewSettings.locked,
            line: scrollLine,
        }, previewSettings.previewColumn, this.#contentProvider, this.#previewConfigurations, this.#logger, this.#topmostLineMonitor, this.#contributions, this.#opener);
        this.#activePreview = preview;
        return this.#registerDynamicPreview(preview);
    }
    #registerDynamicPreview(preview) {
        this.#dynamicPreviews.add(preview);
        preview.onDispose(() => {
            this.#dynamicPreviews.delete(preview);
        });
        this.#trackActive(preview);
        preview.onDidChangeViewState(() => {
            // Remove other dynamic previews in our column
            (0, dispose_1.disposeAll)(Array.from(this.#dynamicPreviews).filter(otherPreview => preview !== otherPreview && preview.matches(otherPreview)));
        });
        return preview;
    }
    #registerStaticPreview(preview) {
        this.#staticPreviews.add(preview);
        preview.onDispose(() => {
            this.#staticPreviews.delete(preview);
        });
        this.#trackActive(preview);
        return preview;
    }
    #trackActive(preview) {
        preview.onDidChangeViewState(({ webviewPanel }) => {
            this.#activePreview = webviewPanel.active ? preview : undefined;
        });
        preview.onDispose(() => {
            if (this.#activePreview === preview) {
                this.#activePreview = undefined;
            }
        });
    }
}
exports.MarkdownPreviewManager = MarkdownPreviewManager;
//# sourceMappingURL=previewManager.js.map