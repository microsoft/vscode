/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NotebookDocument, TextDocument } from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { derived } from '../../../../util/vs/base/common/observableInternal';

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
		// this should filter out documents coming from output pane, git fs, etc.
		if (!['file', 'untitled'].includes(document.uri.scheme) && !isNotebookCellOrNotebookChatInput(document.uri)) {
			return false;
		}
		if (isTextDocument(document) && !this._isGhostTextEnabled(document.languageId)) {
			return false;
		}
		if (await this._ignoreService.isCopilotIgnored(document.uri)) {
			return false;
		}
		return true;
	}

	private _isGhostTextEnabled(languageId: string): boolean {
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
