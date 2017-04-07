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
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ReleaseNotesInput } from './releaseNotesInput';
import { EditorOptions } from 'vs/workbench/common/editor';
import WebView from 'vs/workbench/parts/html/browser/webview';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';

function renderBody(body: string): string {
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src http: https: data:; media-src http: https: data:; script-src 'none'; style-src file: http: https: 'unsafe-inline'; child-src 'none'; frame-src 'none';">
				<link rel="stylesheet" type="text/css" href="${require.toUrl('./media/markdown.css')}">
			</head>
			<body>${body}</body>
		</html>`;
}

export class ReleaseNotesEditor extends BaseEditor {

	static ID: string = 'workbench.editor.releaseNotes';

	private content: HTMLElement;
	private webview: WebView;

	private contentDisposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@IOpenerService private openerService: IOpenerService,
		@IModeService private modeService: IModeService,
		@IPartService private partService: IPartService
	) {
		super(ReleaseNotesEditor.ID, telemetryService, themeService);
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		this.content = append(container, $('.release-notes', { 'style': 'height: 100%' }));
	}

	setInput(input: ReleaseNotesInput, options: EditorOptions): TPromise<void> {
		const { text } = input;

		this.contentDisposables = dispose(this.contentDisposables);
		this.content.innerHTML = '';

		return super.setInput(input, options)
			.then(() => {
				const result = [];
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					const modeId = this.modeService.getModeIdForLanguageName(lang);
					result.push(this.modeService.getOrCreateMode(modeId));
					return '';
				};

				marked(text, { renderer });
				return TPromise.join(result);
			}).then(() => {
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					const modeId = this.modeService.getModeIdForLanguageName(lang);
					return `<code>${tokenizeToString(code, modeId)}</code>`;
				};

				return marked(text, { renderer });
			})
			.then(renderBody)
			.then<void>(body => {
				this.webview = new WebView(this.content, this.partService.getContainer(Parts.EDITOR_PART));
				this.webview.baseUrl = `https://code.visualstudio.com/raw/`;
				this.webview.style(this.themeService.getTheme());
				this.webview.contents = [body];

				this.webview.onDidClickLink(link => this.openerService.open(link), null, this.contentDisposables);
				this.themeService.onThemeChange(themeId => this.webview.style(themeId), null, this.contentDisposables);
				this.contentDisposables.push(this.webview);
				this.contentDisposables.push(toDisposable(() => this.webview = null));
			});
	}

	layout(): void {
		// noop
	}

	focus(): void {
		if (!this.webview) {
			return;
		}

		this.webview.focus();
	}

	dispose(): void {
		this.contentDisposables = dispose(this.contentDisposables);
		super.dispose();
	}
}
