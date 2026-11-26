/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookDocument, TextDocument } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { Schemas } from '../../../../util/vs/base/common/network';
import { derived } from '../../../../util/vs/base/common/observableInternal';

/**
 * Schemes of documents that next edit suggestions never track. Users don't type in them, and their
 * content changes would show up as misleading recent edits in other documents' prompts.
 *
 * Every other scheme is tracked: under unification, next edit suggestions replace ghost text, which
 * served any document whose scheme its own ignore list doesn't cover.
 */
const ignoredSchemes = new Set<string>([
	'output', // output pane (tracking it would log about itself in a loop)
	'search-editor',
	'comment',
	'git',
	Schemas.chatEditingSnapshotScheme,
	Schemas.chatEditingModel,
	'chat-editing-notebook-snapshot-model',
	Schemas.vscodeChatCodeBlock,
	Schemas.vscodeChatCodeCompareBlock,
	Schemas.vscodeChatInput,
	'vscode-chat-terminal-output',
]);

export class DocumentFilter {
	private readonly _enabledLanguagesObs;
	private readonly _ignoreCompletionsDisablement;

	constructor(
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		this._enabledLanguagesObs = this._configurationService.getConfigObservable(ConfigKey.Enable);
		this._ignoreCompletionsDisablement = this._configurationService.getConfigObservable(ConfigKey.TeamInternal.InlineEditsIgnoreCompletionsDisablement);
	}

	public async isTrackingEnabled(document: TextDocument | NotebookDocument): Promise<boolean> {
		if (ignoredSchemes.has(document.uri.scheme)) {
			return false;
		}
		if (isTextDocument(document) && !this.isLanguageEnabled(document.languageId)) {
			return false;
		}
		if (await this._ignoreService.isCopilotIgnored(document.uri)) {
			return false;
		}
		return true;
	}

	/**
	 * Whether Copilot inline suggestions (inline completions and next edit suggestions) are
	 * enabled for the given language according to the per-language `github.copilot.enable` setting.
	 */
	public isLanguageEnabled(languageId: string): boolean {
		const enabledLanguages = this._enabledLanguages.get();
		return enabledLanguages.get(languageId) ?? (
			enabledLanguages.get('*')! ||
			this._ignoreCompletionsDisablement.get() // respect if there's per-language setting but allow overriding global one
		);
	}

	private readonly _enabledLanguages = derived(this, (reader) => {
		const enabledLanguages = this._enabledLanguagesObs.read(reader);
		const enabledLanguagesMap = new Map(Object.entries(enabledLanguages));
		if (!enabledLanguagesMap.has('*')) {
			enabledLanguagesMap.set('*', false);
		}
		return enabledLanguagesMap;
	});
}

function isTextDocument(doc: TextDocument | NotebookDocument): doc is TextDocument {
	const notebook = doc as NotebookDocument;
	return !notebook.notebookType;
}
