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
exports.MdDocumentRenderer = void 0;
const vscode = __importStar(require("vscode"));
const uri = __importStar(require("vscode-uri"));
const dom_1 = require("../util/dom");
const uuid_1 = require("../util/uuid");
/**
 * Strings used inside the markdown preview.
 *
 * Stored here and then injected in the preview so that they
 * can be localized using our normal localization process.
 */
const previewStrings = {
    cspAlertMessageText: vscode.l10n.t("Some content has been disabled in this document"),
    cspAlertMessageTitle: vscode.l10n.t("Potentially unsafe or insecure content has been disabled in the Markdown preview. Change the Markdown preview security setting to allow insecure content or enable scripts"),
    cspAlertMessageLabel: vscode.l10n.t("Content Disabled Security Warning")
};
class MdDocumentRenderer {
    #engine;
    #context;
    #cspArbiter;
    #contributionProvider;
    #logger;
    constructor(engine, context, cspArbiter, contributionProvider, logger) {
        this.#engine = engine;
        this.#context = context;
        this.#cspArbiter = cspArbiter;
        this.#contributionProvider = contributionProvider;
        this.#logger = logger;
        this.iconPath = {
            dark: vscode.Uri.joinPath(this.#context.extensionUri, 'media', 'preview-dark.svg'),
            light: vscode.Uri.joinPath(this.#context.extensionUri, 'media', 'preview-light.svg'),
        };
    }
    iconPath;
    async renderDocument(markdownDocument, resourceProvider, previewConfigurations, initialLine, selectedLine, state, imageInfo, token) {
        const sourceUri = markdownDocument.uri;
        const config = previewConfigurations.loadAndCacheConfiguration(sourceUri);
        const initialData = {
            source: sourceUri.toString(),
            fragment: state?.fragment || markdownDocument.uri.fragment || undefined,
            line: initialLine,
            selectedLine,
            scrollPreviewWithEditor: config.scrollPreviewWithEditor,
            scrollEditorWithPreview: config.scrollEditorWithPreview,
            doubleClickToSwitchToEditor: config.doubleClickToSwitchToEditor,
            disableSecurityWarnings: this.#cspArbiter.shouldDisableSecurityWarnings(),
            webviewResourceRoot: resourceProvider.asWebviewUri(markdownDocument.uri).toString(),
        };
        this.#logger.trace('DocumentRenderer', `provideTextDocumentContent - ${markdownDocument.uri}`, initialData);
        // Content Security Policy
        const nonce = (0, uuid_1.generateUuid)();
        const csp = this.#getCsp(resourceProvider, sourceUri, nonce);
        const body = await this.renderBody(markdownDocument, resourceProvider);
        if (token.isCancellationRequested) {
            return { html: '', containingImages: new Set() };
        }
        const html = `<!DOCTYPE html>
			<html style="${(0, dom_1.escapeAttribute)(this.#getSettingsOverrideStyles(config))}">
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="${(0, dom_1.escapeAttribute)(csp)}">
				<meta id="vscode-markdown-preview-data"
					data-settings="${(0, dom_1.escapeAttribute)(JSON.stringify(initialData))}"
					data-strings="${(0, dom_1.escapeAttribute)(JSON.stringify(previewStrings))}"
					data-state="${(0, dom_1.escapeAttribute)(JSON.stringify(state || {}))}"
					data-initial-md-content="${(0, dom_1.escapeAttribute)(body.html)}">
				<script src="${this.#extensionResourcePath(resourceProvider, 'pre.js')}" nonce="${nonce}"></script>
				${this.#getStyles(resourceProvider, sourceUri, config, imageInfo)}
				<base href="${resourceProvider.asWebviewUri(markdownDocument.uri)}">
			</head>
			<body class="vscode-body ${config.scrollBeyondLastLine ? 'scrollBeyondLastLine' : ''} ${config.wordWrap ? 'wordWrap' : ''} ${config.markEditorSelection ? 'showEditorSelection' : ''}">
				${this.#getScripts(resourceProvider, nonce)}
			</body>
			</html>`;
        return {
            html,
            containingImages: body.containingImages,
        };
    }
    async renderBody(markdownDocument, resourceProvider) {
        const rendered = await this.#engine.render(markdownDocument, resourceProvider);
        const html = `<div class="markdown-body" dir="auto">${rendered.html}<div class="code-line" data-line="${markdownDocument.lineCount}"></div></div>`;
        return {
            html,
            containingImages: rendered.containingImages
        };
    }
    renderFileNotFoundDocument(resource) {
        const resourcePath = uri.Utils.basename(resource);
        const body = vscode.l10n.t('{0} cannot be found', resourcePath);
        return `<!DOCTYPE html>
			<html>
			<body class="vscode-body">
				${body}
			</body>
			</html>`;
    }
    #extensionResourcePath(resourceProvider, mediaFile) {
        const webviewResource = resourceProvider.asWebviewUri(vscode.Uri.joinPath(this.#context.extensionUri, 'media', mediaFile));
        return webviewResource.toString();
    }
    #fixHref(resourceProvider, resource, href) {
        if (!href) {
            return href;
        }
        if (href.startsWith('http:') || href.startsWith('https:') || href.startsWith('file:')) {
            return href;
        }
        // Assume it must be a local file
        if (href.startsWith('/') || /^[a-z]:\\/i.test(href)) {
            return resourceProvider.asWebviewUri(vscode.Uri.file(href)).toString();
        }
        // Use a workspace relative path if there is a workspace
        const root = vscode.workspace.getWorkspaceFolder(resource);
        if (root) {
            return resourceProvider.asWebviewUri(vscode.Uri.joinPath(root.uri, href)).toString();
        }
        // Otherwise look relative to the markdown file
        return resourceProvider.asWebviewUri(vscode.Uri.joinPath(uri.Utils.dirname(resource), href)).toString();
    }
    #computeCustomStyleSheetIncludes(resourceProvider, resource, config) {
        if (!Array.isArray(config.styles)) {
            return '';
        }
        const out = [];
        for (const style of config.styles) {
            out.push(`<link rel="stylesheet" class="code-user-style" data-source="${(0, dom_1.escapeAttribute)(style)}" href="${(0, dom_1.escapeAttribute)(this.#fixHref(resourceProvider, resource, style))}" type="text/css" media="screen">`);
        }
        return out.join('\n');
    }
    #getSettingsOverrideStyles(config) {
        return [
            config.fontFamily ? `--markdown-font-family: ${config.fontFamily};` : '',
            isNaN(config.fontSize) ? '' : `--markdown-font-size: ${config.fontSize}px;`,
            isNaN(config.lineHeight) ? '' : `--markdown-line-height: ${config.lineHeight};`,
        ].join(' ');
    }
    #getImageStabilizerStyles(imageInfo) {
        if (!imageInfo.length) {
            return '';
        }
        let ret = '<style>\n';
        for (const imgInfo of imageInfo) {
            ret += `#${imgInfo.id}.loading {
					height: ${imgInfo.height}px;
					width: ${imgInfo.width}px;
				}\n`;
        }
        ret += '</style>\n';
        return ret;
    }
    #getStyles(resourceProvider, resource, config, imageInfo) {
        const baseStyles = [];
        for (const resource of this.#contributionProvider.contributions.previewStyles) {
            baseStyles.push(`<link rel="stylesheet" type="text/css" href="${(0, dom_1.escapeAttribute)(resourceProvider.asWebviewUri(resource))}">`);
        }
        return `${baseStyles.join('\n')}
			${this.#computeCustomStyleSheetIncludes(resourceProvider, resource, config)}
			${this.#getImageStabilizerStyles(imageInfo)}`;
    }
    #getScripts(resourceProvider, nonce) {
        const out = [];
        for (const resource of this.#contributionProvider.contributions.previewScripts) {
            out.push(`<script async
				src="${(0, dom_1.escapeAttribute)(resourceProvider.asWebviewUri(resource))}"
				nonce="${nonce}"
				charset="UTF-8"></script>`);
        }
        return out.join('\n');
    }
    #getCsp(provider, resource, nonce) {
        const rule = provider.cspSource.split(';')[0];
        switch (this.#cspArbiter.getSecurityLevelForResource(resource)) {
            case 1 /* MarkdownPreviewSecurityLevel.AllowInsecureContent */:
                return `default-src 'none'; img-src 'self' ${rule} http: https: data:; media-src 'self' ${rule} http: https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' http: https: data:; font-src 'self' ${rule} http: https: data:;`;
            case 3 /* MarkdownPreviewSecurityLevel.AllowInsecureLocalContent */:
                return `default-src 'none'; img-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; media-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data: http://localhost:* http://127.0.0.1:*; font-src 'self' ${rule} https: data: http://localhost:* http://127.0.0.1:*;`;
            case 2 /* MarkdownPreviewSecurityLevel.AllowScriptsAndAllContent */:
                return ``;
            case 0 /* MarkdownPreviewSecurityLevel.Strict */:
            default:
                return `default-src 'none'; img-src 'self' ${rule} https: data:; media-src 'self' ${rule} https: data:; script-src 'nonce-${nonce}'; style-src 'self' ${rule} 'unsafe-inline' https: data:; font-src 'self' ${rule} https: data:;`;
        }
    }
}
exports.MdDocumentRenderer = MdDocumentRenderer;
//# sourceMappingURL=documentRenderer.js.map