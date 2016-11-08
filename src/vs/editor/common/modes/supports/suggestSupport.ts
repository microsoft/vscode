/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { ISuggestResult, ISuggestSupport } from 'vs/editor/common/modes';
import { IFilter, matchesPrefix } from 'vs/base/common/filters';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { wireCancellationToken } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export class TextualSuggestSupport implements ISuggestSupport {

	public get triggerCharacters(): string[] {
		return [];
	}

	public get filter(): IFilter {
		return matchesPrefix;
	}

	private _editorWorkerService: IEditorWorkerService;
	private _configurationService: IConfigurationService;

	constructor(editorWorkerService: IEditorWorkerService, configurationService: IConfigurationService) {
		this._editorWorkerService = editorWorkerService;
		this._configurationService = configurationService;
	}

	public provideCompletionItems(model: IReadOnlyModel, position: Position, token: CancellationToken): Thenable<ISuggestResult> {
		let config = this._configurationService.getConfiguration<{ wordBasedSuggestions: boolean }>('editor');
		if (!config || config.wordBasedSuggestions) {
			return wireCancellationToken(token, this._editorWorkerService.textualSuggest(model.uri, position));
		}
	}
}
