/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { $, getWindow } from '../../../../base/browser/dom.js';
import { safeSetInnerHtml, sanitizeHtml } from '../../../../base/browser/domSanitize.js';
import { allowedMarkdownHtmlAttributes, allowedMarkdownHtmlTags } from '../../../../base/browser/markdownRenderer.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { escapeMarkdownSyntaxTokens } from '../../../../base/common/htmlContent.js';
import { KeybindingParser } from '../../../../base/common/keybindingParser.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { escape } from '../../../../base/common/strings.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { TokenizationRegistry } from '../../../../editor/common/languages.js';
import { generateTokensCSSForColorMap } from '../../../../editor/common/languages/supports/tokenization.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { tokenizeToString } from '../../../../editor/common/languages/textToHtmlTokenizer.js';
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
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { SimpleSettingRenderer } from '../../markdown/browser/markdownSettingRenderer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Schemas } from '../../../../base/common/network.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { dirname } from '../../../../base/common/resources.js';
import { asWebviewUri } from '../../webview/common/webview.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { AccessibilityCommandId } from '../../accessibility/common/accessibilityCommands.js';
import { RUN_ONBOARDING_TRYOUT_COMMAND_ID } from '../../onboarding/common/onboardingTryout.js';
import { ReleaseNotesTryouts } from './releaseNotesTryouts.js';

interface IReleaseNotesCodeBlock {
	readonly id: string;
	readonly text: string;
	readonly language: string | undefined;
}

interface IReleaseNotesTokenization {
	readonly value: string;
	readonly codeBlocks: readonly { readonly id: string; readonly html: string }[];
}

export class ReleaseNotesManager extends Disposable {
	private readonly _simpleSettingRenderer: SimpleSettingRenderer;
	private readonly _releaseNotesCache = new Map<string, Promise<string>>();

	private _currentReleaseNotes: WebviewInput | undefined = undefined;
	private readonly _currentDocument = this._register(new MutableDisposable<ReleaseNotesTryouts>());
	private readonly _pendingDocument = this._register(new MutableDisposable<ReleaseNotesTryouts>());
	private readonly _webviewDisposables = this._register(new MutableDisposable<DisposableStore>());
	private _showRequest = 0;
	private _tokenizationRequest = 0;
	private _codeBlocks: readonly IReleaseNotesCodeBlock[] = [];

	constructor(
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
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
	) {
		super();

		this._register(TokenizationRegistry.onDidChange(() => {
			this.updateTokenization().catch(onUnexpectedError);
		}));

		this._register(_configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
		this._register(_webviewWorkbenchService.onDidChangeActiveWebviewEditor((e) => this.onDidChangeActiveWebviewEditor(e)));
		this._simpleSettingRenderer = this._instantiationService.createInstance(SimpleSettingRenderer);
	}

	private async updateTokenization(): Promise<void> {
		const input = this._currentReleaseNotes;
		const document = this._currentDocument.value;
		if (!input || !document) {
			return;
		}
		const request = ++this._tokenizationRequest;
		const codeBlocks = await Promise.all(this._codeBlocks.map(async block => {
			const languageId = block.language
				? this._languageService.getLanguageIdByLanguageName(block.language) ?? this._languageService.getLanguageIdByLanguageName(block.language.split(/\s+|:|,|(?!^)\{|\?]/, 1)[0])
				: null;
			const html = block.language === undefined ? escape(block.text) : await tokenizeToString(this._languageService, block.text, languageId);
			return { id: block.id, html: html.replace(/\n$/, '') + '\n' };
		}));
		if (request !== this._tokenizationRequest || this._currentDocument.value !== document || this._store.isDisposed) {
			return;
		}
		const colorMap = TokenizationRegistry.getColorMap();
		await input.webview.postMessage({
			type: 'releaseNotesTokenization',
			documentId: document.documentId,
			value: colorMap ? generateTokensCSSForColorMap(colorMap) : '',
			codeBlocks,
		});
	}

	private async getBase(useCurrentFile: boolean) {
		if (useCurrentFile) {
			const currentFileUri = this._codeEditorService.getActiveCodeEditor()?.getModel()?.uri;
			if (currentFileUri) {
				return dirname(currentFileUri);
			}
		}
		return URI.parse('https://code.visualstudio.com/raw');
	}

	public async show(version: string, useCurrentFile: boolean): Promise<boolean> {
		const request = ++this._showRequest;
		this._pendingDocument.clear();
		const releaseNoteText = await this.loadReleaseNotes(version, useCurrentFile);
		const base = await this.getBase(useCurrentFile);
		if (request !== this._showRequest || this._store.isDisposed) {
			return false;
		}
		const tryouts = this._instantiationService.createInstance(ReleaseNotesTryouts);
		this._pendingDocument.value = tryouts;
		const codeBlocks: IReleaseNotesCodeBlock[] = [];
		let html: string;
		try {
			html = await this.renderBody({ text: releaseNoteText, base }, tryouts, codeBlocks);
		} catch (error) {
			if (this._pendingDocument.value === tryouts) {
				this._pendingDocument.clear();
			}
			throw error;
		}
		if (request !== this._showRequest || this._pendingDocument.value !== tryouts) {
			if (this._pendingDocument.value === tryouts) {
				this._pendingDocument.clear();
			}
			return false;
		}
		const title = nls.localize('releaseNotesInputName', "Release Notes: {0}", version);

		const activeEditorPane = this._editorService.activeEditorPane;
		const reuseWebview = !!this._currentReleaseNotes;
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.setWebviewTitle(title);
		} else {
			this._currentReleaseNotes = this._webviewWorkbenchService.openWebview(
				{
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
				},
				'releaseNotes',
				title,
				Codicon.vscode,
				{ group: ACTIVE_GROUP, preserveFocus: false });

			const input = this._currentReleaseNotes;
			const disposables = new DisposableStore();
			this._webviewDisposables.value = disposables;

			const onDispose = () => {
				if (this._currentReleaseNotes === input) {
					this._showRequest++;
					this._currentReleaseNotes = undefined;
					this._codeBlocks = [];
					this._currentDocument.clear();
					this._pendingDocument.clear();
					this._webviewDisposables.clear();
				}
			};
			disposables.add(Event.once(input.webview.onDidDispose)(onDispose));
			disposables.add(Event.once(input.onWillDispose)(onDispose));

			disposables.add(input.webview.onDidClickLink(uri => this.onDidClickLink(URI.parse(uri)).catch(onUnexpectedError)));

			disposables.add(input.webview.onMessage(e => {
				if (this._currentReleaseNotes !== input || e.message?.documentId !== this._currentDocument.value?.documentId) {
					return;
				}
				if (e.message.type === 'releaseNotesReady') {
					this.updateCheckboxWebview();
					this.updateTokenization().catch(onUnexpectedError);
				} else if (e.message.type === 'showReleaseNotes') {
					this._configurationService.updateValue('update.showReleaseNotes', e.message.value);
				} else if (e.message.type === 'clickSetting') {
					const x = input.webview.container.offsetLeft + e.message.value.x;
					const y = input.webview.container.offsetTop + e.message.value.y;
					this._simpleSettingRenderer.updateSetting(URI.parse(e.message.value.uri), x, y);
				}
			}));

			let accessibilityHintAnnounced = false;
			const hint = disposables.add(new RunOnceScheduler(() => {
				if (!accessibilityHintAnnounced && input.webview.isFocused && this._accessibilityService.isScreenReaderOptimized()
					&& this._configurationService.getValue(AccessibilityVerbositySettingId.ReleaseNotes)) {
					const keybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
					if (keybinding) {
						accessibilityHintAnnounced = true;
						status(nls.localize('releaseNotes.accessibilityHint', "Press {0} for release notes accessibility help.", keybinding));
					}
				}
			}, 1000));
			disposables.add(input.webview.onDidFocus(() => hint.schedule()));
			disposables.add(input.webview.onDidBlur(() => hint.cancel()));
			hint.schedule();
		}

		const input = this._currentReleaseNotes;
		this._currentDocument.value = this._pendingDocument.clearAndLeak();
		this._codeBlocks = codeBlocks;
		tryouts.attach(input.webview, () => this._currentReleaseNotes === input
			&& this._editorService.activeEditor === input && getWindow(input.webview.container).document.hasFocus());
		input.webview.setHtml(html);
		if (reuseWebview) {
			this._webviewWorkbenchService.revealWebview(input, activeEditorPane ? activeEditorPane.group : this._editorGroupService.activeGroup, false);
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
					return kb;
				}

				return keybinding.getLabel() || kb;
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
					text = await asTextOrError(await this._requestService.request({ url, callSite: 'releaseNotesEditor.fetchReleaseNotes' }, CancellationToken.None));
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
		} else if (uri.scheme === Schemas.command && uri.path === RUN_ONBOARDING_TRYOUT_COMMAND_ID) {
			await this._currentDocument.value?.openLink(uri);
		} else {
			const updated = await this.addGAParameters(uri, 'ReleaseNotes');
			await this._openerService.open(updated, { allowCommands: ['workbench.action.openSettings', 'summarize.release.notes', RUN_ONBOARDING_TRYOUT_COMMAND_ID] });
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

	private async renderBody(fileContent: { text: string; base: URI }, tryouts: ReleaseNotesTryouts, codeBlocks: IReleaseNotesCodeBlock[]) {
		const nonce = generateUuid();

		const processedContent = await renderReleaseNotesMarkdown(fileContent.text, this._extensionService, this._languageService, this._simpleSettingRenderer, this._productService.quality, tryouts, codeBlocks);

		const colorMap = TokenizationRegistry.getColorMap();
		const css = colorMap ? generateTokensCSSForColorMap(colorMap) : '';
		const showReleaseNotes = Boolean(this._configurationService.getValue<boolean>('update.showReleaseNotes'));

		return `<!DOCTYPE html>
		<html>
			<head>
				<base href="${asWebviewUri(fileContent.base).toString(true)}/" >
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; style-src 'nonce-${nonce}' https://code.visualstudio.com; script-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}

					.release-notes-tryout-link:focus-visible,
					.release-notes-tryout-setup:focus-visible {
						outline: var(--vscode-strokeThickness) solid var(--vscode-focusBorder);
						outline-offset: calc(-1 * var(--vscode-strokeThickness));
					}

					.release-notes-tryout-link[aria-disabled="true"],
					.release-notes-tryout-message {
						color: var(--vscode-descriptionForeground);
					}

					.release-notes-tryout-message,
					.release-notes-tryout-setup {
						margin-inline-start: var(--vscode-spacing-size40);
					}

					.release-notes-tryout-setup {
						border: 0;
						padding: 0;
						background: none;
						color: var(--vscode-textLink-foreground);
						font: inherit;
						text-decoration: underline;
						cursor: pointer;
					}

					.release-notes-tryout-setup:hover {
						color: var(--vscode-textLink-activeForeground);
					}

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
				<style id="release-notes-tokenization" nonce="${nonce}">${css}</style>
			</head>
			<body>
				${processedContent}
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					const documentId = ${JSON.stringify(tryouts.documentId)};
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
					label.textContent = ${JSON.stringify(nls.localize('showOnUpdate', "Show release notes after an update")).replace(/</g, '\\u003c')};
					container.appendChild(label);

					const beforeElement = document.querySelector("body > h1")?.nextElementSibling;
					if (beforeElement) {
						document.body.insertBefore(container, beforeElement);
					} else {
						document.body.appendChild(container);
					}

					window.addEventListener('message', event => {
						if (event.data.documentId !== documentId) {
							return;
						}
						if (event.data.type === 'showReleaseNotes') {
							input.checked = event.data.value;
						} else if (event.data.type === 'releaseNotesTokenization') {
							(${applyReleaseNotesTokenization.toString()})(document, event.data);
						}
					});

					window.addEventListener('click', event => {
						const href = event.target.href ?? event.target.parentElement?.href ?? event.target.parentElement?.parentElement?.href;
						if (href && (href.startsWith('${Schemas.codeSetting}'))) {
							vscode.postMessage({ type: 'clickSetting', documentId, value: { uri: href, x: event.clientX, y: event.clientY }});
						}
					});

					window.addEventListener('keypress', event => {
						if (event.keyCode === 13) {
							if (event.target.children.length > 0 && event.target.children[0].href) {
								const clientRect = event.target.getBoundingClientRect();
								vscode.postMessage({ type: 'clickSetting', documentId, value: { uri: event.target.children[0].href, x: clientRect.right , y: clientRect.bottom }});
							}
						}
					});

					input.addEventListener('change', event => {
						vscode.postMessage({ type: 'showReleaseNotes', documentId, value: input.checked }, '*');
					});
					vscode.postMessage({ type: 'releaseNotesReady', documentId });
				</script>
				<script nonce="${nonce}">
					${tryouts.getScript()}
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
				documentId: this._currentDocument.value?.documentId,
				value: this._configurationService.getValue<boolean>('update.showReleaseNotes')
			});
		}
	}
}

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
 * - `IN_PRODUCT` - Content shown in JustRide (both Stable and Insiders)
 * - `WEB` - Content shown on the website only
 * - `STABLE` - Content shown in JustRide Stable only
 * - `INSIDERS` - Content shown in JustRide Insiders only
 * - `TRYOUTS` - Content shown only when the local Try This renderer is provided
 *
 * On the website, the entire block is a single HTML comment, so the
 * content is hidden by default. The website renderer would activate
 * `WEB` blocks by stripping the comment markers.
 */
export function processConditionalBlocks(text: string, activeConditions: ReadonlySet<string>): string {
	return text.replace(
		/<!--\s*%IF\s+(\w+)\s*%([\s\S]*?)%ENDIF\s*%\s*-->/gi,
		(_match, condition: string, content: string) => {
			if (activeConditions.has(condition.toUpperCase())) {
				// Strip comment markers, reveal content
				return content;
			}
			// Remove the entire block
			return '';
		}
	);
}

export async function renderReleaseNotesMarkdown(
	text: string,
	extensionService: IExtensionService,
	languageService: ILanguageService,
	simpleSettingRenderer: SimpleSettingRenderer,
	quality?: string,
	tryouts?: ReleaseNotesTryouts,
	codeBlocks?: IReleaseNotesCodeBlock[],
): Promise<TrustedHTML> {
	// Remove HTML comment markers around table of contents navigation
	text = text
		.toString()
		.replace(/<!--\s*TOC\s*/gi, '')
		.replace(/\s*Navigation End\s*-->/gi, '');

	// Process conditional blocks based on active conditions
	const activeConditions = new Set<string>(['IN_PRODUCT']);
	if (quality === 'stable') {
		activeConditions.add('STABLE');
	} else if (quality === 'insider') {
		activeConditions.add('INSIDERS');
	}
	if (tryouts) {
		activeConditions.add('TRYOUTS');
	}
	text = processConditionalBlocks(text, activeConditions);

	const sanitizerConfig = {
		allowRelativeMediaPaths: true,
		allowedLinkProtocols: {
			override: [Schemas.http, Schemas.https, Schemas.command, Schemas.codeSetting]
		},
		allowedTags: { augment: ['nav', 'svg', 'path'] },
		allowedAttributes: { augment: ['aria-role', 'viewBox', 'fill', 'xmlns', 'd'] }
	};
	const codeBlockIds = new WeakMap<marked.Token, string>();
	const renderer = new marked.Renderer();
	const content = await renderMarkdownDocument(text, extensionService, languageService, {
		sanitizerConfig,
		markedExtensions: [{
			walkTokens: token => {
				if (codeBlocks && token.type === 'code') {
					const id = `release-notes-code-${generateUuid()}`;
					codeBlockIds.set(token, id);
					codeBlocks.push({ id, text: token.text, language: token.lang });
				}
			},
			renderer: {
				html: simpleSettingRenderer.getHtmlRenderer(),
				codespan: simpleSettingRenderer.getCodeSpanRenderer(),
				code: token => codeBlocks ? renderer.code(token).replace('<code', `<code id="${codeBlockIds.get(token)}"`) : false,
			}
		}]
	});
	if (!tryouts || !tryouts.needsRender(content)) {
		return content;
	}
	const tryoutSanitizerConfig = {
		...sanitizerConfig,
		allowedTags: { override: allowedMarkdownHtmlTags, augment: [...sanitizerConfig.allowedTags.augment, 'button'] },
		allowedAttributes: {
			override: [...allowedMarkdownHtmlAttributes, 'name', 'id', 'class', 'role', 'tabindex', 'placeholder'],
			augment: [...sanitizerConfig.allowedAttributes.augment, 'type', 'hidden', 'aria-label', 'aria-disabled', 'data-release-notes-tryout-id', 'data-release-notes-tryout-index'],
		},
	};
	const container = $('div');
	safeSetInnerHtml(container, content.toString(), tryoutSanitizerConfig);
	tryouts.render(container);
	return sanitizeHtml(container.innerHTML, tryoutSanitizerConfig);
}

/* eslint-disable no-restricted-syntax -- This serialized function accesses IDs owned by the isolated release notes webview. */
export function applyReleaseNotesTokenization(targetDocument: Document, update: IReleaseNotesTokenization): void {
	const scrollingElement = targetDocument.scrollingElement;
	const scrollTop = scrollingElement?.scrollTop ?? 0;
	const scrollLeft = scrollingElement?.scrollLeft ?? 0;
	for (const block of update.codeBlocks) {
		const code = targetDocument.getElementById(block.id);
		if (code) {
			// The host generates this markup with tokenizeToString, which escapes all source text.
			code.innerHTML = block.html;
		}
	}
	targetDocument.getElementById('release-notes-tokenization')!.textContent = update.value;
	if (scrollingElement) {
		scrollingElement.scrollTop = scrollTop;
		scrollingElement.scrollLeft = scrollLeft;
	}
}
/* eslint-enable no-restricted-syntax */
