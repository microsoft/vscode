// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import {
    CancellationToken,
    CompletionContext,
    CompletionItem,
    CompletionList,
    Position,
    TextDocument,
    Uri,
} from 'vscode';

export interface PylanceApi {
    client?: {
        isEnabled(): boolean;
        start(): Promise<void>;
        stop(): Promise<void>;
    };
    notebook?: {
        registerJupyterPythonPathFunction(func: (uri: Uri) => Promise<string | undefined>): void;
        getCompletionItems(
            document: TextDocument,
            position: Position,
            context: CompletionContext,
            token: CancellationToken,
        ): Promise<CompletionItem[] | CompletionList | undefined>;
    };
}
