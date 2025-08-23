// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { CompletionItemProvider, DocumentSelector, languages } from 'vscode';
import { Disposable } from 'vscode-jsonrpc';
import { ILanguageService } from './types';

@injectable()
export class LanguageService implements ILanguageService {
    public registerCompletionItemProvider(
        selector: DocumentSelector,
        provider: CompletionItemProvider,
        ...triggerCharacters: string[]
    ): Disposable {
        return languages.registerCompletionItemProvider(selector, provider, ...triggerCharacters);
    }
}
