/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { marked } from 'vs/base/common/marked/marked';
import { OS } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { asText } from 'vs/base/node/request';
import { IMode, TokenizationRegistry } from 'vs/editor/common/modes';
import { generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IModeService } from 'vs/editor/common/services/modeService';
import * as nls from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IRequestService } from 'vs/platform/request/node/request';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { addGAParameters } from 'vs/platform/telemetry/node/telemetryNodeUtils';
import { IWebviewEditorService } from 'vs/workbench/parts/webview/electron-browser/webviewEditorService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { Position } from 'vs/platform/editor/common/editor';
import { WebviewEditorInput } from 'vs/workbench/parts/webview/electron-browser/webviewEditorInput';

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

export class ReleaseNotesManager {

	private _releaseNotesCache: { [version: string]: TPromise<string>; } = Object.create(null);

	private _currentReleaseNotes: WebviewEditorInput | undefined = undefined;

	public constructor(
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IRequestService private readonly _requestService: IRequestService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IWebviewEditorService private readonly _webviewEditorService: IWebviewEditorService,
	) { }

	public async show(
		accessor: ServicesAccessor,
		version: string
	): TPromise<boolean> {
		const releaseNoteText = await this.loadReleaseNotes(version);
		const html = await this.renderBody(releaseNoteText);
		const title = nls.localize('releaseNotesInputName', "Release Notes: {0}", version);

		const activeEditor = this._editorService.getActiveEditor();
		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.setName(title);
			this._currentReleaseNotes.html = html;
			this._webviewEditorService.revealWebview(this._currentReleaseNotes, activeEditor ? activeEditor.position : undefined);
		} else {
			this._currentReleaseNotes = this._webviewEditorService.createWebview(
				'releaseNotes',
				title,
				activeEditor ? activeEditor.position : Position.ONE,
				{ tryRestoreScrollPosition: true, enableFindWidget: true },
				undefined, {
					onDidClickLink: uri => this.onDidClickLink(uri),
					onDispose: () => { this._currentReleaseNotes = undefined; }
				});

			this._currentReleaseNotes.html = html;
		}

		return true;
	}

	private loadReleaseNotes(
		version: string
	): TPromise<string> {
		const match = /^(\d+\.\d+)\./.exec(version);
		if (!match) {
			return TPromise.wrapError<string>(new Error('not found'));
		}

		const versionLabel = match[1].replace(/\./g, '_');
		const baseUrl = 'https://code.visualstudio.com/raw';
		const url = `${baseUrl}/v${versionLabel}.md`;
		const unassigned = nls.localize('unassigned', "unassigned");

		const patchKeybindings = (text: string): string => {
			const kb = (match: string, kb: string) => {
				const keybinding = this._keybindingService.lookupKeybinding(kb);

				if (!keybinding) {
					return unassigned;
				}

				return keybinding.getLabel();
			};

			const kbstyle = (match: string, kb: string) => {
				const keybinding = KeybindingIO.readKeybinding(kb, OS);

				if (!keybinding) {
					return unassigned;
				}

				const resolvedKeybindings = this._keybindingService.resolveKeybinding(keybinding);

				if (resolvedKeybindings.length === 0) {
					return unassigned;
				}

				return resolvedKeybindings[0].getLabel();
			};

			return text
				.replace(/kb\(([a-z.\d\-]+)\)/gi, kb)
				.replace(/kbstyle\(([^\)]+)\)/gi, kbstyle);
		};

		if (!this._releaseNotesCache[version]) {
			this._releaseNotesCache[version] = this._requestService.request({ url })
				.then(asText)
				.then(text => patchKeybindings(text));
		}

		return this._releaseNotesCache[version];
	}

	private onDidClickLink(uri: URI) {
		addGAParameters(this._telemetryService, this._environmentService, uri, 'ReleaseNotes')
			.then(updated => this._openerService.open(updated))
			.then(null, onUnexpectedError);
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
			const modeId = this._modeService.getModeIdForLanguageName(lang);
			result.push(this._modeService.getOrCreateMode(modeId));
			return '';
		};

		marked(text, { renderer });
		await TPromise.join(result);

		renderer.code = (code, lang) => {
			const modeId = this._modeService.getModeIdForLanguageName(lang);
			return `<code>${tokenizeToString(code, modeId)}</code>`;
		};
		return renderer;
	}
}
