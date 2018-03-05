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
import { Webview } from 'vs/workbench/parts/html/browser/webview';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { WebviewEditor } from 'vs/workbench/parts/html/browser/webviewEditor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMode, TokenizationRegistry } from 'vs/editor/common/modes';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { onUnexpectedError } from 'vs/base/common/errors';
import { addGAParameters } from 'vs/platform/telemetry/node/telemetryNodeUtils';
import { generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';

function renderBody(
	body: string,
	css: string
): string {
	const styleSheetPath = require.toUrl('./media/markdown.css').replace('file://', 'vscode-core-resource://');
	return `<!DOCTYPE html>
		<html>
			<head>
				<base href="https://code.visualstudio.com/raw/">
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src vscode-core-resource: https: 'unsafe-inline'; child-src 'none'; frame-src 'none';">
				<link rel="stylesheet" type="text/css" href="${styleSheetPath}">
				<style>${css}</style>
			</head>
			<body>${body}</body>
		</html>`;
}

export class ReleaseNotesEditor extends WebviewEditor {

	static readonly ID: string = 'workbench.editor.releaseNotes';

	private contentDisposables: IDisposable[] = [];
	private scrollYPercentage: number = 0;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService protected readonly themeService: IThemeService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IModeService private readonly modeService: IModeService,
		@IPartService private readonly partService: IPartService,
		@IContextViewService private readonly _contextViewService: IContextViewService
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

		const body = await this.renderBody(text);
		this._webview = new Webview(
			this.content,
			this.partService.getContainer(Parts.EDITOR_PART),
			this.themeService,
			this.environmentService,
			this._contextViewService,
			this.contextKey,
			this.findInputFocusContextKey,
			{});

		if (this.input && this.input instanceof ReleaseNotesInput) {
			const state = this.loadViewState(this.input.version);
			if (state) {
				this._webview.initialScrollProgress = state.scrollYPercentage;
			}
		}

		this._webview.contents = body;

		this._webview.onDidClickLink(link => {
			addGAParameters(this.telemetryService, this.environmentService, link, 'ReleaseNotes')
				.then(updated => this.openerService.open(updated))
				.then(null, onUnexpectedError);
		}, null, this.contentDisposables);
		this._webview.onDidScroll(event => {
			this.scrollYPercentage = event.scrollYPercentage;
		}, null, this.contentDisposables);
		this.contentDisposables.push(this._webview);
		this.contentDisposables.push(toDisposable(() => this._webview = null));
	}

	dispose(): void {
		this.contentDisposables = dispose(this.contentDisposables);
		super.dispose();
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

	private async renderBody(text: string) {
		const colorMap = TokenizationRegistry.getColorMap();
		const css = generateTokensCSSForColorMap(colorMap);
		const body = renderBody(await this.renderContent(text), css);
		return body;
	}

	private async renderContent(text: string): TPromise<string> {
		const renderer = await this.getRenderer(text);
		return marked(text, { renderer });
	}

	private async getRenderer(text: string) {
		const result: TPromise<IMode>[] = [];
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
		return renderer;
	}
}
