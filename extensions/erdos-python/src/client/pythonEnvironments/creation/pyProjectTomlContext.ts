// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TextDocument } from 'vscode';
import { IDisposableRegistry } from '../../common/types';
import { executeCommand } from '../../common/vscodeApis/commandApis';
import {
    onDidOpenTextDocument,
    onDidSaveTextDocument,
    getOpenTextDocuments,
} from '../../common/vscodeApis/workspaceApis';
import { isPipInstallableToml } from './provider/venvUtils';

async function setPyProjectTomlContextKey(doc: TextDocument): Promise<void> {
    if (isPipInstallableToml(doc.getText())) {
        await executeCommand('setContext', 'pipInstallableToml', true);
    } else {
        await executeCommand('setContext', 'pipInstallableToml', false);
    }
}

export function registerPyProjectTomlFeatures(disposables: IDisposableRegistry): void {
    disposables.push(
        onDidOpenTextDocument(async (doc: TextDocument) => {
            if (doc.fileName.endsWith('pyproject.toml')) {
                await setPyProjectTomlContextKey(doc);
            }
        }),
        onDidSaveTextDocument(async (doc: TextDocument) => {
            if (doc.fileName.endsWith('pyproject.toml')) {
                await setPyProjectTomlContextKey(doc);
            }
        }),
    );

    const docs = getOpenTextDocuments().filter(
        (doc) => doc.fileName.endsWith('pyproject.toml') && isPipInstallableToml(doc.getText()),
    );
    if (docs.length > 0) {
        executeCommand('setContext', 'pipInstallableToml', true);
    } else {
        executeCommand('setContext', 'pipInstallableToml', false);
    }
}
