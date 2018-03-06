/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { IModeService } from 'vs/editor/common/services/modeService';
import { tokenizeToString } from 'vs/editor/common/modes/textToHtmlTokenizer';
import { IMode, TokenizationRegistry } from 'vs/editor/common/modes';
import { generateTokensCSSForColorMap } from 'vs/editor/common/modes/supports/tokenization';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingIO } from 'vs/workbench/services/keybinding/common/keybindingIO';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IRequestService } from 'vs/platform/request/node/request';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { WebviewInput } from 'vs/workbench/parts/webview/electron-browser/webviewInput';
import { onUnexpectedError } from 'vs/base/common/errors';
import { addGAParameters } from 'vs/platform/telemetry/node/telemetryNodeUtils';
import URI from 'vs/base/common/uri';
import { asText } from 'vs/base/node/request';
import * as nls from 'vs/nls';
import { OS } from 'vs/base/common/platform';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';

function renderBody(
	body: string,
	css: string,
	scrollProgress: number = 0
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


const releaseNotesCache: { [version: string]: TPromise<string>; } = Object.create(null);

function loadReleaseNotes(accessor: ServicesAccessor, version: string): TPromise<string> {
	const requestService = accessor.get(IRequestService);
	const keybindingService = accessor.get(IKeybindingService);
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
			const keybinding = keybindingService.lookupKeybinding(kb);

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

			const resolvedKeybindings = keybindingService.resolveKeybinding(keybinding);

			if (resolvedKeybindings.length === 0) {
				return unassigned;
			}

			return resolvedKeybindings[0].getLabel();
		};

		return text
			.replace(/kb\(([a-z.\d\-]+)\)/gi, kb)
			.replace(/kbstyle\(([^\)]+)\)/gi, kbstyle);
	};

	if (!releaseNotesCache[version]) {
		releaseNotesCache[version] = requestService.request({ url })
			.then(asText)
			.then(text => patchKeybindings(text));
	}

	return releaseNotesCache[version];
}

export class ReleaseNotesManager {

	private _currentReleaseNotes: WebviewInput | undefined;

	public constructor(
		@IWorkbenchEditorService private readonly _editorService: IWorkbenchEditorService,
		@IEditorGroupService private readonly _editorGroupService: IEditorGroupService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IModeService private readonly _modeService: IModeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IPartService private readonly _partService: IPartService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	public async show(
		accessor: ServicesAccessor,
		version: string
	): TPromise<boolean> {
		const releaseNoteText = await loadReleaseNotes(accessor, version);
		const html = await this.renderBody(releaseNoteText);
		const title = nls.localize('releaseNotesInputName', "Release Notes: {0}", version);

		if (this._currentReleaseNotes) {
			this._currentReleaseNotes.setName(title);
			this._currentReleaseNotes.setHtml(html);
			const activeEditor = this._editorService.getActiveEditor();
			if (activeEditor && activeEditor.position !== this._currentReleaseNotes.position) {
				this._editorGroupService.moveEditor(this._currentReleaseNotes, this._currentReleaseNotes.position, activeEditor.position, { preserveFocus: true });
			} else {
				this._editorService.openEditor(this._currentReleaseNotes, { preserveFocus: true });
			}
		} else {
			const uri = URI.parse('release-notes:' + version);
			this._currentReleaseNotes = this._instantiationService.createInstance(WebviewInput, uri, title, { tryRestoreScrollPosition: true }, html, {
				onDidClickLink: uri => this.onDidClickLink(uri),
				onDispose: () => { this._currentReleaseNotes = undefined; }
			}, this._partService);
			await this._editorService.openEditor(this._currentReleaseNotes, { pinned: true });
		}

		return true;
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
