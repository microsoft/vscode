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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import { escape } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import * as nls from '../../../../nls.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from '../../markdown/browser/markdownDocumentRenderer.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { getTelemetryLevel, supportsTelemetry } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { SimpleSettingRenderer } from '../../markdown/browser/markdownSettingRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../base/common/network.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { dirname } from '../../../../base/common/resources.js';
import { asWebviewUri } from '../../webview/common/webview.js';
let ReleaseNotesManager = class ReleaseNotesManager extends Disposable {
    constructor(_environmentService, _keybindingService, _languageService, _openerService, _requestService, _configurationService, _editorService, _editorGroupService, _codeEditorService, _webviewWorkbenchService, _extensionService, _productService, _instantiationService) {
        super();
        this._environmentService = _environmentService;
        this._keybindingService = _keybindingService;
        this._languageService = _languageService;
        this._openerService = _openerService;
        this._requestService = _requestService;
        this._configurationService = _configurationService;
        this._editorService = _editorService;
        this._editorGroupService = _editorGroupService;
        this._codeEditorService = _codeEditorService;
        this._webviewWorkbenchService = _webviewWorkbenchService;
        this._extensionService = _extensionService;
        this._productService = _productService;
        this._instantiationService = _instantiationService;
        this._releaseNotesCache = new Map();
        this._currentReleaseNotes = undefined;
        this._register(TokenizationRegistry.onDidChange(() => {
            return this.updateHtml();
        }));
        this._register(_configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
        this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor((e) => this.onDidChangeActiveWebviewEditor(e)));
        this._simpleSettingRenderer = this._instantiationService.createInstance(SimpleSettingRenderer);
    }
    async updateHtml() {
        if (!this._currentReleaseNotes || !this._lastMeta) {
            return;
        }
        const html = await this.renderBody(this._lastMeta);
        if (this._currentReleaseNotes) {
            this._currentReleaseNotes.webview.setHtml(html);
        }
    }
    async getBase(useCurrentFile) {
        if (useCurrentFile) {
            const currentFileUri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
            if (currentFileUri) {
                return dirname(currentFileUri);
            }
        }
        return URI.parse('https://code.visualstudio.com/raw');
    }
    async show(version, useCurrentFile) {
        const releaseNoteText = await this.loadReleaseNotes(version, useCurrentFile);
        const base = await this.getBase(useCurrentFile);
        this._lastMeta = { text: releaseNoteText, base };
        const html = await this.renderBody(this._lastMeta);
        const title = nls.localize('releaseNotesInputName', "Release Notes: {0}", version);
        const activeEditorPane = this._editorService.activeEditorPane;
        if (this._currentReleaseNotes) {
            this._currentReleaseNotes.setWebviewTitle(title);
            this._currentReleaseNotes.webview.setHtml(html);
            this._webviewWorkbenchService.revealWebview(this._currentReleaseNotes, activeEditorPane ? activeEditorPane.group : this._editorGroupService.activeGroup, false);
        }
        else {
            this._currentReleaseNotes = this._webviewWorkbenchService.openWebview({
                title,
                options: {
                    tryRestoreScrollPosition: true,
                    enableFindWidget: true,
                    disableServiceWorker: useCurrentFile ? false : true,
                },
                contentOptions: {
                    localResourceRoots: useCurrentFile ? [base] : [],
                    allowScripts: true
                },
                extension: undefined
            }, 'releaseNotes', title, Codicon.vscode, { group: ACTIVE_GROUP, preserveFocus: false });
            const disposables = new DisposableStore();
            disposables.add(this._currentReleaseNotes.webview.onDidClickLink(uri => this.onDidClickLink(URI.parse(uri))));
            disposables.add(this._currentReleaseNotes.webview.onMessage(e => {
                if (e.message.type === 'showReleaseNotes') {
                    this._configurationService.updateValue('update.showReleaseNotes', e.message.value);
                }
                else if (e.message.type === 'clickSetting') {
                    const x = this._currentReleaseNotes?.webview.container.offsetLeft + e.message.value.x;
                    const y = this._currentReleaseNotes?.webview.container.offsetTop + e.message.value.y;
                    this._simpleSettingRenderer.updateSetting(URI.parse(e.message.value.uri), x, y);
                }
            }));
            disposables.add(this._currentReleaseNotes.onWillDispose(() => {
                disposables.dispose();
                this._currentReleaseNotes = undefined;
            }));
            this._currentReleaseNotes.webview.setHtml(html);
        }
        return true;
    }
    async loadReleaseNotes(version, useCurrentFile) {
        const match = /^(\d+\.\d+)\./.exec(version);
        if (!match) {
            throw new Error('not found');
        }
        const versionLabel = match[1].replace(/\./g, '_');
        const baseUrl = 'https://code.visualstudio.com/raw';
        const url = `${baseUrl}/v${versionLabel}.md`;
        const unassigned = nls.localize('unassigned', "unassigned");
        const escapeMdHtml = (text) => {
            return escape(text).replace(/\\/g, '\\\\');
        };
        const patchKeybindings = (text) => {
            const kb = (match, kb) => {
                const keybinding = this._keybindingService.lookupKeybinding(kb);
                if (!keybinding) {
                    return unassigned;
                }
                return keybinding.getLabel() || unassigned;
            };
            const kbstyle = (match, kb) => {
                const keybinding = KeybindingParser.parseKeybinding(kb);
                if (!keybinding) {
                    return unassigned;
                }
                const resolvedKeybindings = this._keybindingService.resolveKeybinding(keybinding);
                if (resolvedKeybindings.length === 0) {
                    return unassigned;
                }
                return resolvedKeybindings[0].getLabel() || unassigned;
            };
            const kbCode = (match, binding) => {
                const resolved = kb(match, binding);
                return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
            };
            const kbstyleCode = (match, binding) => {
                const resolved = kbstyle(match, binding);
                return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
            };
            return text
                .replace(/`kb\(([a-z.\d\-]+)\)`/gi, kbCode)
                .replace(/`kbstyle\(([^\)]+)\)`/gi, kbstyleCode)
                .replace(/kb\(([a-z.\d\-]+)\)/gi, (match, binding) => escapeMarkdownSyntaxTokens(kb(match, binding)))
                .replace(/kbstyle\(([^\)]+)\)/gi, (match, binding) => escapeMarkdownSyntaxTokens(kbstyle(match, binding)));
        };
        const fetchReleaseNotes = async () => {
            let text;
            try {
                if (useCurrentFile) {
                    const file = this._codeEditorService.getActiveCodeEditor()?.getModel()?.getValue();
                    text = file ? file.substring(file.indexOf('#')) : undefined;
                }
                else {
                    text = await asTextOrError(await this._requestService.request({ url, callSite: 'releaseNotesEditor.fetchReleaseNotes' }, CancellationToken.None));
                }
            }
            catch {
                throw new Error('Failed to fetch release notes');
            }
            if (!text || (!/^#\s/.test(text) && !useCurrentFile)) { // release notes always starts with `#` followed by whitespace, except when using the current file
                throw new Error('Invalid release notes');
            }
            return patchKeybindings(text);
        };
        // Don't cache the current file
        if (useCurrentFile) {
            return fetchReleaseNotes();
        }
        if (!this._releaseNotesCache.has(version)) {
            this._releaseNotesCache.set(version, (async () => {
                try {
                    return await fetchReleaseNotes();
                }
                catch (err) {
                    this._releaseNotesCache.delete(version);
                    throw err;
                }
            })());
        }
        return this._releaseNotesCache.get(version);
    }
    async onDidClickLink(uri) {
        if (uri.scheme === Schemas.codeSetting) {
            // handled in receive message
        }
        else {
            this.addGAParameters(uri, 'ReleaseNotes')
                .then(updated => this._openerService.open(updated, { allowCommands: ['workbench.action.openSettings', 'summarize.release.notes'] }))
                .then(undefined, onUnexpectedError);
        }
    }
    async addGAParameters(uri, origin, experiment = '1') {
        if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === 3 /* TelemetryLevel.USAGE */) {
            if (uri.scheme === 'https' && uri.authority === 'code.visualstudio.com') {
                return uri.with({ query: `${uri.query ? uri.query + '&' : ''}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_content=${encodeURIComponent(experiment)}` });
            }
        }
        return uri;
    }
    async renderBody(fileContent) {
        const nonce = generateUuid();
        const processedContent = await renderReleaseNotesMarkdown(fileContent.text, this._extensionService, this._languageService, this._simpleSettingRenderer, this._productService.quality);
        const colorMap = TokenizationRegistry.getColorMap();
        const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
        const showReleaseNotes = Boolean(this._configurationService.getValue('update.showReleaseNotes'));
        return `<!DOCTYPE html>
		<html>
			<head>
				<base href="${asWebviewUri(fileContent.base).toString(true)}/" >
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'nonce-${nonce}' https://code.visualstudio.com; script-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}

					/* codesetting */

					code:has(.codesetting) {
						background-color: var(--vscode-textPreformat-background);
						color: var(--vscode-textPreformat-foreground);
						padding-left: 1px;
						margin-right: 3px;
						padding-right: 0px;
					}

					code:has(.codesetting):focus {
						border: 1px solid var(--vscode-button-border, transparent);
					}

					.codesetting {
						color: var(--vscode-textPreformat-foreground);
						padding: 0px 1px 1px 0px;
						font-size: 0px;
						overflow: hidden;
						text-overflow: ellipsis;
						outline-offset: 2px !important;
						box-sizing: border-box;
						text-align: center;
						cursor: pointer;
						display: inline;
						margin-right: 3px;
					}
					.codesetting svg {
						font-size: 12px;
						text-align: center;
						cursor: pointer;
						border: 1px solid var(--vscode-button-secondaryBorder, transparent);
						outline: 1px solid transparent;
						line-height: 9px;
						margin-bottom: -5px;
						padding-left: 0px;
						padding-top: 2px;
						padding-bottom: 2px;
						padding-right: 2px;
						display: inline-block;
						text-decoration: none;
						text-rendering: auto;
						text-transform: none;
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
						user-select: none;
						-webkit-user-select: none;
					}
					.codesetting .setting-name {
						font-size: 13px;
						padding-left: 2px;
						padding-right: 3px;
						padding-top: 1px;
						padding-bottom: 1px;
						margin-top: -3px;
					}
					.codesetting:hover {
						color: var(--vscode-textPreformat-foreground) !important;
						text-decoration: none !important;
					}
					code:has(.codesetting):hover {
						filter: brightness(140%);
						text-decoration: none !important;
					}
					.codesetting:focus {
						outline: 0 !important;
						text-decoration: none !important;
						color: var(--vscode-button-hoverForeground) !important;
					}
					.codesetting .separator {
						width: 1px;
						height: 14px;
						margin-bottom: -3px;
						display: inline-block;
						background-color: var(--vscode-editor-background);
						font-size: 12px;
						margin-right: 4px;
					}

					header { display: flex; align-items: center; padding-top: 1em; }

					/* Release notes enhancements from vscode-docs */
					html {
						font-size: 10px;
						height: 100%;
						overscroll-behavior: none;
					}

					body {
						margin: 0 auto;
						max-width: 980px;
						height: auto;
						overflow-y: auto;
						overscroll-behavior: none;
					}

					/* Scroll to top button */
					#scroll-to-top {
						position: fixed;
						width: 40px;
						height: 40px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-background, #444);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-hoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-foreground);
						/* Chevron up icon */
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}

					/* Header styling */
					h2 {
						margin-top: 1.2em;
						scroll-margin-top: 1.2em;
					}

					h2:not(:first-of-type) {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h3 {
						margin-top: 4em;
						scroll-margin-top: 1em;
					}

					h2 + h3 {
						margin-top: 0;
					}

					/* Highlights table styling */
					.highlights-table {
						border-collapse: collapse;
						border: none;
					}

					.highlights-table th {
						vertical-align: top;
						border: none;
						padding-top: 2em;
						font-weight: bold;
					}

					.highlights-table td {
						vertical-align: top;
						border: none;
					}

					.highlights-table tr:nth-child(2) td {
						padding-bottom: 1em;
					}

					/* Main content layout */
					.toc-nav-layout {
						display: flex;
						align-items: flex-start;
					}

					/* TOC Navigation */
					#toc-nav {
						position: sticky;
						top: 20px;
						width: 10vw;
						min-width: 120px;
						margin-right: 32px;
						margin-top: 2em;
					}

					#toc-nav > div {
						font-weight: bold;
						font-size: 1em;
						margin-bottom: 1em;
						text-transform: uppercase;
					}

					#toc-nav ul {
						list-style: none;
						padding: 0;
						margin: 0;
					}

					#toc-nav ul li {
						margin-bottom: 0.5em;
					}

					#toc-nav a {
						color: var(--vscode-editor-foreground, #ccc);
						text-decoration: none !important;
						transition: background-color 0.2s, color 0.2s;
						padding: 4px 6px;
						margin: -4px -6px;
						border-radius: 4px;
						display: block;
						outline: none;
					}

					#toc-nav a:hover {
						background-color: var(--vscode-button-secondaryHoverBackground, #1177bb);
						color: var(--vscode-button-secondaryForeground, #ffffff);
						cursor: pointer;
						text-decoration: none !important;
					}

					/* Main content area */
					.notes-main {
						flex: 1;
						min-width: 0;
					}

					/* Responsive breakpoint - Hide TOC on smaller screens */
					@media (max-width: 576px) {
						#toc-nav {
							display: none;
						}

						.toc-nav-layout {
							flex-direction: column;
						}

						.notes-main {
							margin-left: 0;
						}
					}

				</style>
			</head>
			<body>
				${processedContent}
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					const container = document.createElement('p');
					container.style.display = 'flex';
					container.style.alignItems = 'center';

					const input = document.createElement('input');
					input.type = 'checkbox';
					input.id = 'showReleaseNotes';
					input.checked = ${showReleaseNotes};
					container.appendChild(input);

					const label = document.createElement('label');
					label.htmlFor = 'showReleaseNotes';
					label.textContent = '${nls.localize('showOnUpdate', "Show release notes after an update")}';
					container.appendChild(label);

					const beforeElement = document.querySelector("body > h1")?.nextElementSibling;
					if (beforeElement) {
						document.body.insertBefore(container, beforeElement);
					} else {
						document.body.appendChild(container);
					}

					window.addEventListener('message', event => {
						if (event.data.type === 'showReleaseNotes') {
							input.checked = event.data.value;
						}
					});

					window.addEventListener('click', event => {
						const href = event.target.href ?? event.target.parentElement?.href ?? event.target.parentElement?.parentElement?.href;
						if (href && (href.startsWith('${Schemas.codeSetting}'))) {
							vscode.postMessage({ type: 'clickSetting', value: { uri: href, x: event.clientX, y: event.clientY }});
						}
					});

					window.addEventListener('keypress', event => {
						if (event.keyCode === 13) {
							if (event.target.children.length > 0 && event.target.children[0].href) {
								const clientRect = event.target.getBoundingClientRect();
								vscode.postMessage({ type: 'clickSetting', value: { uri: event.target.children[0].href, x: clientRect.right , y: clientRect.bottom }});
							}
						}
					});

					input.addEventListener('change', event => {
						vscode.postMessage({ type: 'showReleaseNotes', value: input.checked }, '*');
					});
				</script>
			</body>
		</html>`;
    }
    onDidChangeConfiguration(e) {
        if (e.affectsConfiguration('update.showReleaseNotes')) {
            this.updateCheckboxWebview();
        }
    }
    onDidChangeActiveWebviewEditor(input) {
        if (input && input === this._currentReleaseNotes) {
            this.updateCheckboxWebview();
        }
    }
    updateCheckboxWebview() {
        if (this._currentReleaseNotes) {
            this._currentReleaseNotes.webview.postMessage({
                type: 'showReleaseNotes',
                value: this._configurationService.getValue('update.showReleaseNotes')
            });
        }
    }
};
ReleaseNotesManager = __decorate([
    __param(0, IEnvironmentService),
    __param(1, IKeybindingService),
    __param(2, ILanguageService),
    __param(3, IOpenerService),
    __param(4, IRequestService),
    __param(5, IConfigurationService),
    __param(6, IEditorService),
    __param(7, IEditorGroupsService),
    __param(8, ICodeEditorService),
    __param(9, IWebviewWorkbenchService),
    __param(10, IExtensionService),
    __param(11, IProductService),
    __param(12, IInstantiationService)
], ReleaseNotesManager);
export { ReleaseNotesManager };
/**
 * Processes conditional blocks in the release notes markdown.
 *
 * Conditional blocks use a single HTML comment with the format:
 * ```
 * <!-- %IF CONDITION %
 * Content only visible when CONDITION is active.
 * %ENDIF % -->
 * ```
 *
 * Supported conditions:
 * - `IN_PRODUCT` - Content shown in VS Code (both Stable and Insiders)
 * - `WEB` - Content shown on the website only
 * - `STABLE` - Content shown in VS Code Stable only
 * - `INSIDERS` - Content shown in VS Code Insiders only
 *
 * On the website, the entire block is a single HTML comment, so the
 * content is hidden by default. The website renderer would activate
 * `WEB` blocks by stripping the comment markers.
 */
export function processConditionalBlocks(text, activeConditions) {
    return text.replace(/<!--\s*%IF\s+(\w+)\s*%([\s\S]*?)%ENDIF\s*%\s*-->/gi, (_match, condition, content) => {
        if (activeConditions.has(condition.toUpperCase())) {
            // Strip comment markers, reveal content
            return content;
        }
        // Remove the entire block
        return '';
    });
}
export async function renderReleaseNotesMarkdown(text, extensionService, languageService, simpleSettingRenderer, quality) {
    // Remove HTML comment markers around table of contents navigation
    text = text
        .toString()
        .replace(/<!--\s*TOC\s*/gi, '')
        .replace(/\s*Navigation End\s*-->/gi, '');
    // Process conditional blocks based on active conditions
    const activeConditions = new Set(['IN_PRODUCT']);
    if (quality === 'stable') {
        activeConditions.add('STABLE');
    }
    else if (quality === 'insider') {
        activeConditions.add('INSIDERS');
    }
    text = processConditionalBlocks(text, activeConditions);
    return renderMarkdownDocument(text, extensionService, languageService, {
        sanitizerConfig: {
            allowRelativeMediaPaths: true,
            allowedLinkProtocols: {
                override: [Schemas.http, Schemas.https, Schemas.command, Schemas.codeSetting]
            },
            allowedTags: { augment: ['nav', 'svg', 'path'] },
            allowedAttributes: { augment: ['aria-role', 'viewBox', 'fill', 'xmlns', 'd'] }
        },
        markedExtensions: [{
                renderer: {
                    html: simpleSettingRenderer.getHtmlRenderer(),
                    codespan: simpleSettingRenderer.getCodeSpanRenderer(),
                }
            }]
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsZWFzZU5vdGVzRWRpdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdXBkYXRlL2Jyb3dzZXIvcmVsZWFzZU5vdGVzRWRpdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNwRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDNUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUM5RSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUM1RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUNuRixPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUVySCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUNqRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQy9HLE9BQU8sRUFBNkIscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU5SCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXhELElBQU0sbUJBQW1CLEdBQXpCLE1BQU0sbUJBQW9CLFNBQVEsVUFBVTtJQU9sRCxZQUNzQixtQkFBeUQsRUFDMUQsa0JBQXVELEVBQ3pELGdCQUFtRCxFQUNyRCxjQUErQyxFQUM5QyxlQUFpRCxFQUMzQyxxQkFBNkQsRUFDcEUsY0FBK0MsRUFDekMsbUJBQTBELEVBQzVELGtCQUF1RCxFQUNqRCx3QkFBbUUsRUFDMUUsaUJBQXFELEVBQ3ZELGVBQWlELEVBQzNDLHFCQUE2RDtRQUVwRixLQUFLLEVBQUUsQ0FBQztRQWQ4Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXFCO1FBQ3pDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDeEMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUFrQjtRQUNwQyxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDN0Isb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzFCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFDbkQsbUJBQWMsR0FBZCxjQUFjLENBQWdCO1FBQ3hCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBc0I7UUFDM0MsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFvQjtRQUNoQyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQTBCO1FBQ3pELHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBbUI7UUFDdEMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQzFCLDBCQUFxQixHQUFyQixxQkFBcUIsQ0FBdUI7UUFsQnBFLHVCQUFrQixHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO1FBRWpFLHlCQUFvQixHQUE2QixTQUFTLENBQUM7UUFvQmxFLElBQUksQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRTtZQUNwRCxPQUFPLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUMxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosSUFBSSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN4RyxJQUFJLENBQUMsU0FBUyxDQUFDLHdCQUF3QixDQUFDLDhCQUE4QixDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsOEJBQThCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZILElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMscUJBQXFCLENBQUMsY0FBYyxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDaEcsQ0FBQztJQUVPLEtBQUssQ0FBQyxVQUFVO1FBQ3ZCLElBQUksQ0FBQyxJQUFJLENBQUMsb0JBQW9CLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbkQsT0FBTztRQUNSLENBQUM7UUFDRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ25ELElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakQsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsT0FBTyxDQUFDLGNBQXVCO1FBQzVDLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQixFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsR0FBRyxDQUFDO1lBQ3RGLElBQUksY0FBYyxFQUFFLENBQUM7Z0JBQ3BCLE9BQU8sT0FBTyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUMsS0FBSyxDQUFDLG1DQUFtQyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVNLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBZSxFQUFFLGNBQXVCO1FBQ3pELE1BQU0sZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixDQUFDLE9BQU8sRUFBRSxjQUFjLENBQUMsQ0FBQztRQUM3RSxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDaEQsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLElBQUksRUFBRSxlQUFlLEVBQUUsSUFBSSxFQUFFLENBQUM7UUFDakQsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRW5GLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztRQUM5RCxJQUFJLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQy9CLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDakQsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDaEQsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNqSyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsV0FBVyxDQUNwRTtnQkFDQyxLQUFLO2dCQUNMLE9BQU8sRUFBRTtvQkFDUix3QkFBd0IsRUFBRSxJQUFJO29CQUM5QixnQkFBZ0IsRUFBRSxJQUFJO29CQUN0QixvQkFBb0IsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsSUFBSTtpQkFDbkQ7Z0JBQ0QsY0FBYyxFQUFFO29CQUNmLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFDaEQsWUFBWSxFQUFFLElBQUk7aUJBQ2xCO2dCQUNELFNBQVMsRUFBRSxTQUFTO2FBQ3BCLEVBQ0QsY0FBYyxFQUNkLEtBQUssRUFDTCxPQUFPLENBQUMsTUFBTSxFQUNkLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUVoRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBRTFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFOUcsV0FBVyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtnQkFDL0QsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxrQkFBa0IsRUFBRSxDQUFDO29CQUMzQyxJQUFJLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLHlCQUF5QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ3BGLENBQUM7cUJBQU0sSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxjQUFjLEVBQUUsQ0FBQztvQkFDOUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDdEYsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixFQUFFLE9BQU8sQ0FBQyxTQUFTLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztvQkFDckYsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDakYsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFSixXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxhQUFhLENBQUMsR0FBRyxFQUFFO2dCQUM1RCxXQUFXLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3RCLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxTQUFTLENBQUM7WUFDdkMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUVKLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsT0FBZSxFQUFFLGNBQXVCO1FBQ3RFLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUM5QixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDbEQsTUFBTSxPQUFPLEdBQUcsbUNBQW1DLENBQUM7UUFDcEQsTUFBTSxHQUFHLEdBQUcsR0FBRyxPQUFPLEtBQUssWUFBWSxLQUFLLENBQUM7UUFDN0MsTUFBTSxVQUFVLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFNUQsTUFBTSxZQUFZLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtZQUM3QyxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzVDLENBQUMsQ0FBQztRQUVGLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtZQUNqRCxNQUFNLEVBQUUsR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDeEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUVoRSxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ2pCLE9BQU8sVUFBVSxDQUFDO2dCQUNuQixDQUFDO2dCQUVELE9BQU8sVUFBVSxDQUFDLFFBQVEsRUFBRSxJQUFJLFVBQVUsQ0FBQztZQUM1QyxDQUFDLENBQUM7WUFFRixNQUFNLE9BQU8sR0FBRyxDQUFDLEtBQWEsRUFBRSxFQUFVLEVBQUUsRUFBRTtnQkFDN0MsTUFBTSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUV4RCxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7b0JBQ2pCLE9BQU8sVUFBVSxDQUFDO2dCQUNuQixDQUFDO2dCQUVELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDO2dCQUVsRixJQUFJLG1CQUFtQixDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDdEMsT0FBTyxVQUFVLENBQUM7Z0JBQ25CLENBQUM7Z0JBRUQsT0FBTyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsSUFBSSxVQUFVLENBQUM7WUFDeEQsQ0FBQyxDQUFDO1lBRUYsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFhLEVBQUUsT0FBZSxFQUFFLEVBQUU7Z0JBQ2pELE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3BDLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsT0FBTyxLQUFLLFlBQVksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDMUYsQ0FBQyxDQUFDO1lBRUYsTUFBTSxXQUFXLEdBQUcsQ0FBQyxLQUFhLEVBQUUsT0FBZSxFQUFFLEVBQUU7Z0JBQ3RELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3pDLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxnQkFBZ0IsT0FBTyxLQUFLLFlBQVksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7WUFDMUYsQ0FBQyxDQUFDO1lBRUYsT0FBTyxJQUFJO2lCQUNULE9BQU8sQ0FBQyx5QkFBeUIsRUFBRSxNQUFNLENBQUM7aUJBQzFDLE9BQU8sQ0FBQyx5QkFBeUIsRUFBRSxXQUFXLENBQUM7aUJBQy9DLE9BQU8sQ0FBQyx1QkFBdUIsRUFBRSxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUUsRUFBRSxDQUFDLDBCQUEwQixDQUFDLEVBQUUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztpQkFDcEcsT0FBTyxDQUFDLHVCQUF1QixFQUFFLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsMEJBQTBCLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0csQ0FBQyxDQUFDO1FBRUYsTUFBTSxpQkFBaUIsR0FBRyxLQUFLLElBQUksRUFBRTtZQUNwQyxJQUFJLElBQUksQ0FBQztZQUNULElBQUksQ0FBQztnQkFDSixJQUFJLGNBQWMsRUFBRSxDQUFDO29CQUNwQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CLEVBQUUsRUFBRSxRQUFRLEVBQUUsRUFBRSxRQUFRLEVBQUUsQ0FBQztvQkFDbkYsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztnQkFDN0QsQ0FBQztxQkFBTSxDQUFDO29CQUNQLElBQUksR0FBRyxNQUFNLGFBQWEsQ0FBQyxNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRSxzQ0FBc0MsRUFBRSxFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ25KLENBQUM7WUFDRixDQUFDO1lBQUMsTUFBTSxDQUFDO2dCQUNSLE1BQU0sSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQztZQUNsRCxDQUFDO1lBRUQsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxrR0FBa0c7Z0JBQ3pKLE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUMxQyxDQUFDO1lBRUQsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQUM7UUFFRiwrQkFBK0I7UUFDL0IsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUNwQixPQUFPLGlCQUFpQixFQUFFLENBQUM7UUFDNUIsQ0FBQztRQUNELElBQUksQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDM0MsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDaEQsSUFBSSxDQUFDO29CQUNKLE9BQU8sTUFBTSxpQkFBaUIsRUFBRSxDQUFDO2dCQUNsQyxDQUFDO2dCQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7b0JBQ2QsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDeEMsTUFBTSxHQUFHLENBQUM7Z0JBQ1gsQ0FBQztZQUNGLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNQLENBQUM7UUFFRCxPQUFPLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFFLENBQUM7SUFDOUMsQ0FBQztJQUVPLEtBQUssQ0FBQyxjQUFjLENBQUMsR0FBUTtRQUNwQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLEtBQUssT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3hDLDZCQUE2QjtRQUM5QixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLGNBQWMsQ0FBQztpQkFDdkMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsYUFBYSxFQUFFLENBQUMsK0JBQStCLEVBQUUseUJBQXlCLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ25JLElBQUksQ0FBQyxTQUFTLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUN0QyxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxlQUFlLENBQUMsR0FBUSxFQUFFLE1BQWMsRUFBRSxVQUFVLEdBQUcsR0FBRztRQUN2RSxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksaUJBQWlCLENBQUMsSUFBSSxDQUFDLHFCQUFxQixDQUFDLGlDQUF5QixFQUFFLENBQUM7WUFDakosSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLE9BQU8sSUFBSSxHQUFHLENBQUMsU0FBUyxLQUFLLHVCQUF1QixFQUFFLENBQUM7Z0JBQ3pFLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLGdDQUFnQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzNLLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDWixDQUFDO0lBRU8sS0FBSyxDQUFDLFVBQVUsQ0FBQyxXQUF3QztRQUNoRSxNQUFNLEtBQUssR0FBRyxZQUFZLEVBQUUsQ0FBQztRQUU3QixNQUFNLGdCQUFnQixHQUFHLE1BQU0sMEJBQTBCLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXRMLE1BQU0sUUFBUSxHQUFHLG9CQUFvQixDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ3BELE1BQU0sR0FBRyxHQUFHLFFBQVEsQ0FBQyxDQUFDLENBQUMsNEJBQTRCLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNuRSxNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLHlCQUF5QixDQUFDLENBQUMsQ0FBQztRQUUxRyxPQUFPOzs7a0JBR1MsWUFBWSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDOzt1SUFFd0UsS0FBSyxzREFBc0QsS0FBSztvQkFDbkwsS0FBSztPQUNsQix1QkFBdUI7T0FDdkIsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O01BK1BKLGdCQUFnQjtxQkFDRCxLQUFLOzs7Ozs7Ozs7dUJBU0gsZ0JBQWdCOzs7Ozs0QkFLWCxHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxvQ0FBb0MsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7Ozs7O3NDQWtCeEQsT0FBTyxDQUFDLFdBQVc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7VUFtQi9DLENBQUM7SUFDVixDQUFDO0lBRU8sd0JBQXdCLENBQUMsQ0FBNEI7UUFDNUQsSUFBSSxDQUFDLENBQUMsb0JBQW9CLENBQUMseUJBQXlCLENBQUMsRUFBRSxDQUFDO1lBQ3ZELElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBRU8sOEJBQThCLENBQUMsS0FBK0I7UUFDckUsSUFBSSxLQUFLLElBQUksS0FBSyxLQUFLLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ2xELElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQzlCLENBQUM7SUFDRixDQUFDO0lBRU8scUJBQXFCO1FBQzVCLElBQUksSUFBSSxDQUFDLG9CQUFvQixFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7Z0JBQzdDLElBQUksRUFBRSxrQkFBa0I7Z0JBQ3hCLEtBQUssRUFBRSxJQUFJLENBQUMscUJBQXFCLENBQUMsUUFBUSxDQUFVLHlCQUF5QixDQUFDO2FBQzlFLENBQUMsQ0FBQztRQUNKLENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQTdqQlksbUJBQW1CO0lBUTdCLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHFCQUFxQixDQUFBO0lBQ3JCLFdBQUEsY0FBYyxDQUFBO0lBQ2QsV0FBQSxvQkFBb0IsQ0FBQTtJQUNwQixXQUFBLGtCQUFrQixDQUFBO0lBQ2xCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsWUFBQSxpQkFBaUIsQ0FBQTtJQUNqQixZQUFBLGVBQWUsQ0FBQTtJQUNmLFlBQUEscUJBQXFCLENBQUE7R0FwQlgsbUJBQW1CLENBNmpCL0I7O0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7QUFDSCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsSUFBWSxFQUFFLGdCQUFxQztJQUMzRixPQUFPLElBQUksQ0FBQyxPQUFPLENBQ2xCLG9EQUFvRCxFQUNwRCxDQUFDLE1BQU0sRUFBRSxTQUFpQixFQUFFLE9BQWUsRUFBRSxFQUFFO1FBQzlDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUM7WUFDbkQsd0NBQXdDO1lBQ3hDLE9BQU8sT0FBTyxDQUFDO1FBQ2hCLENBQUM7UUFDRCwwQkFBMEI7UUFDMUIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDLENBQ0QsQ0FBQztBQUNILENBQUM7QUFFRCxNQUFNLENBQUMsS0FBSyxVQUFVLDBCQUEwQixDQUMvQyxJQUFZLEVBQ1osZ0JBQW1DLEVBQ25DLGVBQWlDLEVBQ2pDLHFCQUE0QyxFQUM1QyxPQUFnQjtJQUVoQixrRUFBa0U7SUFDbEUsSUFBSSxHQUFHLElBQUk7U0FDVCxRQUFRLEVBQUU7U0FDVixPQUFPLENBQUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDO1NBQzlCLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUUzQyx3REFBd0Q7SUFDeEQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUcsQ0FBUyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7SUFDekQsSUFBSSxPQUFPLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDMUIsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7U0FBTSxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUNsQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDbEMsQ0FBQztJQUNELElBQUksR0FBRyx3QkFBd0IsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUV4RCxPQUFPLHNCQUFzQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUU7UUFDdEUsZUFBZSxFQUFFO1lBQ2hCLHVCQUF1QixFQUFFLElBQUk7WUFDN0Isb0JBQW9CLEVBQUU7Z0JBQ3JCLFFBQVEsRUFBRSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDN0U7WUFDRCxXQUFXLEVBQUUsRUFBRSxPQUFPLEVBQUUsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQ2hELGlCQUFpQixFQUFFLEVBQUUsT0FBTyxFQUFFLENBQUMsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsQ0FBQyxFQUFFO1NBQzlFO1FBQ0QsZ0JBQWdCLEVBQUUsQ0FBQztnQkFDbEIsUUFBUSxFQUFFO29CQUNULElBQUksRUFBRSxxQkFBcUIsQ0FBQyxlQUFlLEVBQUU7b0JBQzdDLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxtQkFBbUIsRUFBRTtpQkFDckQ7YUFDRCxDQUFDO0tBQ0YsQ0FBQyxDQUFDO0FBQ0osQ0FBQyJ9