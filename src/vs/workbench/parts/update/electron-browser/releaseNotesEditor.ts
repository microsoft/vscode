/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { always } from 'vs/base/common/async';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, $, addClass, removeClass } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ReleaseNotesInput } from './releaseNotesInput';
import { EditorOptions } from 'vs/workbench/common/editor';
import WebView from 'vs/workbench/parts/html/browser/webview';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { asText } from 'vs/base/node/request';
import { Keybinding } from 'vs/base/common/keybinding';
import { IRequestService } from 'vs/platform/request/common/request';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import product from 'vs/platform/product';
import { IModeService } from 'vs/editor/common/services/modeService';
import {tokenizeToString} from 'vs/editor/common/modes/textToHtmlTokenizer';

function renderBody(body: string): string {
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<link rel="stylesheet" type="text/css" href="${ require.toUrl('./media/markdown.css') }" >
			</head>
			<body>${ body }</body>
		</html>`;
}

export class ReleaseNotesEditor extends BaseEditor {

	static ID: string = 'workbench.editor.releaseNotes';

	private content: HTMLElement;

	private contentDisposables: IDisposable[] = [];
	private disposables: IDisposable[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService private themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IRequestService private requestService: IRequestService,
		@IOpenerService private openerService: IOpenerService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IModeService private modeService: IModeService
	) {
		super(ReleaseNotesEditor.ID, telemetryService);
		this.disposables = [];
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		this.content = append(container, $('.release-notes', { 'style': 'height: 100%' }));
	}

	setInput(input: ReleaseNotesInput, options: EditorOptions): TPromise<void> {
		const version = input.version;

		this.content.innerHTML = '';

		const match = /^(\d+\.\d)\./.exec(version);

		if (!match) {
			return TPromise.as(null);
		}

		const versionLabel = match[1].replace(/\./g, '_');
		const baseUrl = 'https://code.visualstudio.com/raw';
		const url = `${ baseUrl }/v${ versionLabel }.md`;

		this.loadContents(() => this.requestService.request({ url })
			.then(asText)
			.then(text => this.patchKeybindings(text))
			.then(text => {
				// we first need to load the modes...
				const result = [];
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					const modeId = this.modeService.getModeIdForLanguageName(lang);
					result.push(this.modeService.getOrCreateMode(modeId));
					return '';
				};

				marked(text, { renderer });
				return TPromise.join(result).then(() => text);
			})
			.then(text => {
				// then we can render
				const renderer = new marked.Renderer();
				renderer.code = (code, lang) => {
					const modeId = this.modeService.getModeIdForLanguageName(lang);
					return `<code>${ tokenizeToString(code, modeId) }</code>`;
				};

				return marked(text, { renderer });
			})
			.then(renderBody)
			.then<void>(body => {
				const webview = new WebView(
					this.content,
					document.querySelector('.monaco-editor-background')
				);

				webview.baseUrl = `${ baseUrl }/`;
				webview.style(this.themeService.getColorTheme());
				webview.contents = [body];

				webview.onDidClickLink(link => this.openerService.open(link), null, this.contentDisposables);
				this.themeService.onDidColorThemeChange(themeId => webview.style(themeId), null, this.contentDisposables);
				this.contentDisposables.push(webview);
			})
			.then(null, () => {
				const uri = URI.parse(product.releaseNotesUrl);
				this.openerService.open(uri);
				this.editorService.closeEditor(this.position, this.input);
			}));

		return super.setInput(input, options);
	}

	private loadContents(loadingTask: ()=>TPromise<any>): void {
		this.contentDisposables = dispose(this.contentDisposables);

		this.content.innerHTML = '';
		addClass(this.content, 'loading');

		let promise = loadingTask();
		promise = always(promise, () => removeClass(this.content, 'loading'));

		this.contentDisposables.push(toDisposable(() => promise.cancel()));
	}

	private patchKeybindings(text: string): string {
		return text.replace(/kb\(([a-z.\d\-]+)\)/gi, (match, kb) => {
			const keybinding = this.keybindingService.lookupKeybindings(kb)[0];

			if (!keybinding) {
				return match;
			}

			return this.keybindingService.getLabelFor(keybinding);
		}).replace(/kbstyle\(([^\)]+)\)/gi, (match, kb) => {
			const code = Keybinding.fromUserSettingsLabel(kb);

			if (!code) {
				return match;
			}

			const keybinding = new Keybinding(code);

			if (!keybinding) {
				return match;
			}

			return this.keybindingService.getLabelFor(keybinding);
		});
	}

	layout(): void {
		// noop
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
