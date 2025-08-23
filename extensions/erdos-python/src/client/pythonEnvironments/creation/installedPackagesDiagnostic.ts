// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { Diagnostic, DiagnosticCollection, TextDocument, Uri } from 'vscode';
import { IDisposableRegistry } from '../../common/types';
import { executeCommand } from '../../common/vscodeApis/commandApis';
import { createDiagnosticCollection, onDidChangeDiagnostics } from '../../common/vscodeApis/languageApis';
import { getActiveTextEditor, onDidChangeActiveTextEditor } from '../../common/vscodeApis/windowApis';
import {
    getOpenTextDocuments,
    onDidCloseTextDocument,
    onDidOpenTextDocument,
    onDidSaveTextDocument,
} from '../../common/vscodeApis/workspaceApis';
import { traceVerbose } from '../../logging';
import { getInstalledPackagesDiagnostics, INSTALL_CHECKER_SOURCE } from './common/installCheckUtils';
import { IInterpreterService } from '../../interpreter/contracts';

export const DEPS_NOT_INSTALLED_KEY = 'pythonDepsNotInstalled';

async function setContextForActiveEditor(diagnosticCollection: DiagnosticCollection): Promise<void> {
    const doc = getActiveTextEditor()?.document;
    if (doc && (doc.languageId === 'pip-requirements' || doc.fileName.endsWith('pyproject.toml'))) {
        const diagnostics = diagnosticCollection.get(doc.uri);
        if (diagnostics && diagnostics.length > 0) {
            traceVerbose(`Setting context for python dependencies not installed: ${doc.uri.fsPath}`);
            await executeCommand('setContext', DEPS_NOT_INSTALLED_KEY, true);
            return;
        }
    }

    // undefined here in the logs means no file was selected
    await executeCommand('setContext', DEPS_NOT_INSTALLED_KEY, false);
}

export function registerInstalledPackagesDiagnosticsProvider(
    disposables: IDisposableRegistry,
    interpreterService: IInterpreterService,
): void {
    const diagnosticCollection = createDiagnosticCollection(INSTALL_CHECKER_SOURCE);
    const updateDiagnostics = (uri: Uri, diagnostics: Diagnostic[]) => {
        if (diagnostics.length > 0) {
            diagnosticCollection.set(uri, diagnostics);
        } else if (diagnosticCollection.has(uri)) {
            diagnosticCollection.delete(uri);
        }
    };

    disposables.push(diagnosticCollection);
    disposables.push(
        onDidOpenTextDocument(async (doc: TextDocument) => {
            if (doc.languageId === 'pip-requirements' || doc.fileName.endsWith('pyproject.toml')) {
                const diagnostics = await getInstalledPackagesDiagnostics(interpreterService, doc);
                updateDiagnostics(doc.uri, diagnostics);
            }
        }),
        onDidSaveTextDocument(async (doc: TextDocument) => {
            if (doc.languageId === 'pip-requirements' || doc.fileName.endsWith('pyproject.toml')) {
                const diagnostics = await getInstalledPackagesDiagnostics(interpreterService, doc);
                updateDiagnostics(doc.uri, diagnostics);
            }
        }),
        onDidCloseTextDocument((e: TextDocument) => {
            updateDiagnostics(e.uri, []);
        }),
        onDidChangeDiagnostics(async () => {
            await setContextForActiveEditor(diagnosticCollection);
        }),
        onDidChangeActiveTextEditor(async () => {
            await setContextForActiveEditor(diagnosticCollection);
        }),
        interpreterService.onDidChangeInterpreter(() => {
            getOpenTextDocuments().forEach(async (doc: TextDocument) => {
                if (doc.languageId === 'pip-requirements' || doc.fileName.endsWith('pyproject.toml')) {
                    const diagnostics = await getInstalledPackagesDiagnostics(interpreterService, doc);
                    updateDiagnostics(doc.uri, diagnostics);
                }
            });
        }),
    );

    getOpenTextDocuments().forEach(async (doc: TextDocument) => {
        if (doc.languageId === 'pip-requirements' || doc.fileName.endsWith('pyproject.toml')) {
            const diagnostics = await getInstalledPackagesDiagnostics(interpreterService, doc);
            updateDiagnostics(doc.uri, diagnostics);
        }
    });
}
