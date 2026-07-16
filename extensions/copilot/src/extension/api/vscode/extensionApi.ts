/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextEditor, window } from 'vscode';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { CopilotExtensionApi as ICopilotExtensionApi } from './api';
import { VSCodeContextProviderApiV1 } from './vscodeContextProviderApi';

export class CopilotExtensionApi implements ICopilotExtensionApi {
	public static readonly version = 1;

	constructor(
		@IScopeSelector private readonly _scopeSelector: IScopeSelector,
		@ILanguageContextProviderService private readonly _languageContextProviderService: ILanguageContextProviderService
	) { }

	async selectScope(editor?: TextEditor, options?: { reason?: string }) {
		editor ??= window.activeTextEditor;
		if (!editor) {
			return;
		}
		return this._scopeSelector.selectEnclosingScope(editor, options);
	}

	getContextProviderAPI(_version: 'v1'): Copilot.ContextProviderApiV1 {
		return new VSCodeContextProviderApiV1(this._languageContextProviderService);
	}
}
