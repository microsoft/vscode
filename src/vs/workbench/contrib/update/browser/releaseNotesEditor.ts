/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/releasenoteseditor.css';
import { CancellationToken } from '../../../../base/common/cancellation.js';
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
import { WebviewInput } from '../../webviewPanel/browser/webviewEditorInput.js';
import { IWebviewWorkbenchService } from '../../webviewPanel/browser/webviewWorkbenchService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { getTelemetryLevel, supportsTelemetry } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { TelemetryLevel } from '../../../../platform/telemetry/common/telemetry.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { SimpleSettingRenderer } from '../../markdown/browser/markdownSettingRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../base/common/network.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';

export class ReleaseNotesManager {
	private readonly _simpleSettingRenderer: SimpleSettingRenderer;
	private readonly _releaseNotesCache = new Map<string, Promise<string>>();

	private _currentReleaseNotes: WebviewInput | undefined = undefined;
	private _lastText: string | undefined;
	private readonly disposables = new DisposableStore();

	public constructor(
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IRequestService private readonly _requestService: IRequestService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupService: IEditorGroupsService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IProductService private readonly _productService: IProductService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		TokenizationRegistry.onDidChange(() => {
			return this.updateHtml();
		});

		_configurationService.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);
		_webviewWorkbenchService.onDidChangeActiveWebviewEditor(this.onDidChangeActiveWebviewEditor, this, this.disposables);
		this._simpleSettingRenderer = this._instantiationService.createInstance(SimpleSettingRenderer);
	}

	private async updateHtml() {
		if (!this._currentReleaseNotes || !this._lastText) {
			return;
		}
		const html = await this.renderBody(this._lastText);
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.webview.setHtml(html);
		}
	}

	public async show(version: string, useCurrentFile: boolean): Promise<boolean> {
		const releaseNoteText = await this.loadReleaseNotes(version, useCurrentFile);
		this._lastText = releaseNoteText;
		const html = await this.renderBody(releaseNoteText);
		const title = nls.localize('releaseNotesInputName', "Release Notes: {0}", version);

		const activeEditorPane = this._editorService.activeEditorPane;
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.setName(title);
			this._currentReleaseNotes.webview.setHtml(html);
			this._webviewWorkbenchService.revealWebview(this._currentReleaseNotes, activeEditorPane ? activeEditorPane.group : this._editorGroupService.activeGroup, false);
		} else {
			this._currentReleaseNotes = this._webviewWorkbenchService.openWebview(
				{
					title,
					options: {
						tryRestoreScrollPosition: true,
						enableFindWidget: true,
						disableServiceWorker: true,
					},
					contentOptions: {
						localResourceRoots: [],
						allowScripts: true
					},
					extension: undefined
				},
				'releaseNotes',
				title,
				{ group: ACTIVE_GROUP, preserveFocus: false });

			this._currentReleaseNotes.webview.onDidClickLink(uri => this.onDidClickLink(URI.parse(uri)));

			const disposables = new DisposableStore();
			disposables.add(this._currentReleaseNotes.webview.onMessage(e => {
				if (e.message.type === 'showReleaseNotes') {
					this._configurationService.updateValue('update.showReleaseNotes', e.message.value);
				} else if (e.message.type === 'clickSetting') {
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

	private async loadReleaseNotes(version: string, useCurrentFile: boolean): Promise<string> {
		const match = /^(\d+\.\d+)\./.exec(version);
		if (!match) {
			throw new Error('not found');
		}

		const versionLabel = match[1].replace(/\./g, '_');
		const baseUrl = 'https://code.visualstudio.com/raw';
		const url = `${baseUrl}/v${versionLabel}.md`;
		const unassigned = nls.localize('unassigned', "unassigned");

		const escapeMdHtml = (text: string): string => {
			return escape(text).replace(/\\/g, '\\\\');
		};

		const patchKeybindings = (text: string): string => {
			const kb = (match: string, kb: string) => {
				const keybinding = this._keybindingService.lookupKeybinding(kb);

				if (!keybinding) {
					return unassigned;
				}

				return keybinding.getLabel() || unassigned;
			};

			const kbstyle = (match: string, kb: string) => {
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

			const kbCode = (match: string, binding: string) => {
				const resolved = kb(match, binding);
				return resolved ? `<code title="${binding}">${escapeMdHtml(resolved)}</code>` : resolved;
			};

			const kbstyleCode = (match: string, binding: string) => {
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
				} else {
					text = await asTextOrError(await this._requestService.request({ url }, CancellationToken.None));
				}
			} catch {
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
				} catch (err) {
					this._releaseNotesCache.delete(version);
					throw err;
				}
			})());
		}

		return this._releaseNotesCache.get(version)!;
	}

	private async onDidClickLink(uri: URI) {
		if (uri.scheme === Schemas.codeSetting) {
			// handled in receive message
		} else {
			this.addGAParameters(uri, 'ReleaseNotes')
				.then(updated => this._openerService.open(updated, { allowCommands: ['workbench.action.openSettings'] }))
				.then(undefined, onUnexpectedError);
		}
	}

	private async addGAParameters(uri: URI, origin: string, experiment = '1'): Promise<URI> {
		if (supportsTelemetry(this._productService, this._environmentService) && getTelemetryLevel(this._configurationService) === TelemetryLevel.USAGE) {
			if (uri.scheme === 'https' && uri.authority === 'code.visualstudio.com') {
				return uri.with({ query: `${uri.query ? uri.query + '&' : ''}utm_source=VsCode&utm_medium=${encodeURIComponent(origin)}&utm_content=${encodeURIComponent(experiment)}` });
			}
		}
		return uri;
	}

	private async renderBody(text: string) {
		const nonce = generateUuid();

		const content = await renderMarkdownDocument(text, this._extensionService, this._languageService, {
			shouldSanitize: false,
			markedExtensions: [{
				renderer: {
					html: this._simpleSettingRenderer.getHtmlRenderer(),
					codespan: this._simpleSettingRenderer.getCodeSpanRenderer(),
				}
			}]
		});
		const colorMap = TokenizationRegistry.getColorMap();
		const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
		const showReleaseNotes = Boolean(this._configurationService.getValue<boolean>('update.showReleaseNotes'));

		return `<!DOCTYPE html>
		<html>
			<head>
				<base href="https://code.visualstudio.com/raw/">
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'nonce-${nonce}' https://code.visualstudio.com; script-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}
					${css}

					/* codesetting */

					code:has(.codesetting)+code {
						display: none;
					}

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
						margin-left: -5px;
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
						margin-right: 8px;
					}

					header { display: flex; align-items: center; padding-top: 1em; }
				</style>
			</head>
			<body>
				${content}
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

	private onDidChangeConfiguration(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('update.showReleaseNotes')) {
			this.updateCheckboxWebview();
		}
	}

	private onDidChangeActiveWebviewEditor(input: WebviewInput | undefined): void {
		if (input && input === this._currentReleaseNotes) {
			this.updateCheckboxWebview();
		}
	}

	private updateCheckboxWebview() {
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.webview.postMessage({
				type: 'showReleaseNotes',
				value: this._configurationService.getValue<boolean>('update.showReleaseNotes')
			});
		}
	}
}
