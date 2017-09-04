/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, $ } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ReleaseNotesInput } from './releaseNotesInput';
import { EditorOptions } from 'vs/workbench/common/editor';
import WebView from 'vs/workbench/parts/html/browser/webview';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { WebviewEditor } from 'vs/workbench/parts/html/browser/webviewEditor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

function renderBody(body: string): string {
	return `<!DOCTYPE html>
		<html>
			<head>
				<base href="https://code.visualstudio.com/raw/">
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src file: https: 'unsafe-inline'; child-src 'none'; frame-src 'none';">
				<link rel="stylesheet" type="text/css" href="${require.toUrl('./media/markdown.css')}">
			</head>
			<body>${body}</body>
		</html>`;
}

export class ReleaseNotesEditor extends WebviewEditor {

	static ID: string = 'workbench.editor.releaseNotes';

	private contentDisposables: IDisposable[] = [];
	private scrollYPercentage: number = 0;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@IOpenerService private openerService: IOpenerService,
		@IModeService private modeService: IModeService,
		@IPartService private partService: IPartService,
		@IStorageService storageService: IStorageService,
		@IContextViewService private _contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super(ReleaseNotesEditor.ID, telemetryService, themeService, storageService, contextKeyService);
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		this.content = append(container, $('.release-notes', { 'style': 'height: 100%; position: relative; overflow: hidden;' }));
	}

	async setInput(input: ReleaseNotesInput, options: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input)) {
			return undefined;
		}

		const { text } = input;

		this.contentDisposables = dispose(this.contentDisposables);
		this.content.innerHTML = '';

		await super.setInput(input, options);

		const result = [];
		const renderer = new marked.Renderer();
		renderer.code = (code, lang) => {
			const modeId = this.modeService.getModeIdForLanguageName(lang);
			result.push(this.modeService.getOrCreateMode(modeId));
			return '';
		};

		marked(text, { renderer });
		await TPromise.join(result);

		renderer.code = (code, lang) => {
			const modeId = this.modeService.getModeIdForLanguageName(lang);
			return `<code>${tokenizeToString(code, modeId)}</code>`;
		};

		const body = renderBody(marked(text, { renderer }));
		this._webview = new WebView(this.content, this.partService.getContainer(Parts.EDITOR_PART), this._contextViewService, this.contextKey, this.findInputFocusContextKey);
		if (this.input && this.input instanceof ReleaseNotesInput) {
			const state = this.loadViewState(this.input.version);
			if (state) {
				this._webview.initialScrollProgress = state.scrollYPercentage;
			}
		}
		this.onThemeChange(this.themeService.getTheme());
		this._webview.contents = [body];

		this._webview.onDidClickLink(link => this.openerService.open(link), null, this.contentDisposables);
		this._webview.onDidScroll(event => {
			this.scrollYPercentage = event.scrollYPercentage;
		}, null, this.contentDisposables);
		this.themeService.onThemeChange(this.onThemeChange, this, this.contentDisposables);
		this.contentDisposables.push(this._webview);
		this.contentDisposables.push(toDisposable(() => this._webview = null));
	}

	layout(): void {
		if (this._webview) {
			this._webview.layout();
		}
	}

	focus(): void {
		if (!this._webview) {
			return;
		}

		this._webview.focus();
	}

	dispose(): void {
		this.contentDisposables = dispose(this.contentDisposables);
		super.dispose();
	}

	protected getViewState() {
		return {
			scrollYPercentage: this.scrollYPercentage
		};
	}

	public clearInput(): void {
		if (this.input instanceof ReleaseNotesInput) {
			this.saveViewState(this.input.version, {
				scrollYPercentage: this.scrollYPercentage
			});
		}
		super.clearInput();
	}

	public shutdown(): void {
		if (this.input instanceof ReleaseNotesInput) {
			this.saveViewState(this.input.version, {
				scrollYPercentage: this.scrollYPercentage
			});
		}
		super.shutdown();
	}
}
