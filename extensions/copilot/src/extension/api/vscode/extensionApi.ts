/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, TextEditor, window } from 'vscode';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { IScopeSelector } from '../../../platform/scopeSelection/common/scopeSelection';
import { ILanguageModelRequestMiddlewareRegistry } from '../../byok/common/languageModelRequestMiddleware';
import { CopilotExtensionApi as ICopilotExtensionApi, LanguageModelRequestMiddleware } from './api';
import { VSCodeContextProviderApiV1 } from './vscodeContextProviderApi';

export class CopilotExtensionApi implements ICopilotExtensionApi {
	public static readonly version = 2;

	constructor(
		@IScopeSelector private readonly _scopeSelector: IScopeSelector,
		@ILanguageContextProviderService private readonly _languageContextProviderService: ILanguageContextProviderService,
		@ILanguageModelRequestMiddlewareRegistry private readonly _languageModelRequestMiddlewareRegistry: ILanguageModelRequestMiddlewareRegistry,
	) { }

	registerLanguageModelRequestMiddleware(middleware: LanguageModelRequestMiddleware): Disposable {
		return this._languageModelRequestMiddlewareRegistry.register({
			selector: middleware.selector,
			errorBehavior: middleware.errorBehavior,
			provideRequestHeaders: context => Promise.resolve(middleware.provideRequestHeaders(context)),
		});
	}

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
