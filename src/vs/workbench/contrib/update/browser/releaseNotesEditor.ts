/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/releasenoteseditor';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { escapeMarkdownSyntaxTokens } from 'vs/base/common/htmlContent';
import { KeybindingParser } from 'vs/base/common/keybindingParser';
import { escape } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { generateTokensCSSForColorMap } from 'vs/editor/common/languages/supports/tokenization';
import { ILanguageService } from 'vs/editor/common/languages/language';
import * as nls from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IProductService } from 'vs/platform/product/common/productService';
import { asTextOrError, IRequestService } from 'vs/platform/request/common/request';
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from 'vs/workbench/contrib/markdown/browser/markdownDocumentRenderer';
import { WebviewInput } from 'vs/workbench/contrib/webviewPanel/browser/webviewEditorInput';
import { IWebviewWorkbenchService } from 'vs/workbench/contrib/webviewPanel/browser/webviewWorkbenchService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { getTelemetryLevel, supportsTelemetry } from 'vs/platform/telemetry/common/telemetryUtils';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class ReleaseNotesManager {

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
		@IWebviewWorkbenchService private readonly _webviewWorkbenchService: IWebviewWorkbenchService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IProductService private readonly _productService: IProductService
	) {
		TokenizationRegistry.onDidChange(async () => {
			if (!this._currentReleaseNotes || !this._lastText) {
				return;
			}
			const html = await this.renderBody(this._lastText);
			if (this._currentReleaseNotes) {
				this._currentReleaseNotes.webview.setHtml(html);
			}
		});

		_configurationService.onDidChangeConfiguration(this.onDidChangeConfiguration, this, this.disposables);
		_webviewWorkbenchService.onDidChangeActiveWebviewEditor(this.onDidChangeActiveWebviewEditor, this, this.disposables);
	}

	public async show(version: string): Promise<boolean> {
		const releaseNoteText = await this.loadReleaseNotes(version);
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

	private async loadReleaseNotes(version: string): Promise<string> {
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
				text = await asTextOrError(await this._requestService.request({ url }, CancellationToken.None));
			} catch {
				throw new Error('Failed to fetch release notes');
			}

			if (!text || !/^#\s/.test(text)) { // release notes always starts with `#` followed by whitespace
				throw new Error('Invalid release notes');
			}

			return patchKeybindings(text);
		};

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

	private onDidClickLink(uri: URI) {
		this.addGAParameters(uri, 'ReleaseNotes')
			.then(updated => this._openerService.open(updated))
			.then(undefined, onUnexpectedError);
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
		const content = await renderMarkdownDocument(text, this._extensionService, this._languageService, false);
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

					input.addEventListener('change', event => {
						vscode.postMessage({ type: 'showReleaseNotes', value: input.checked }, '*');
					});
				</script>
			</body>
		</html>`;
	}

	private onDidChangeConfiguration(e: IConfigurationChangeEvent): void {
		if (e.affectsConfiguration('update.showReleaseNotes')) {
			this.updateWebview();
		}
	}

	private onDidChangeActiveWebviewEditor(input: WebviewInput | undefined): void {
		if (input && input === this._currentReleaseNotes) {
			this.updateWebview();
		}
	}

	private updateWebview() {
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.webview.postMessage({
				type: 'showReleaseNotes',
				value: this._configurationService.getValue<boolean>('update.showReleaseNotes')
			});
		}
	}
}
