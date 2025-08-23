// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License

import { DiagnosticChangeEvent, DiagnosticCollection, Disposable, languages } from 'vscode';

export function createDiagnosticCollection(name: string): DiagnosticCollection {
    return languages.createDiagnosticCollection(name);
}

export function onDidChangeDiagnostics(handler: (e: DiagnosticChangeEvent) => void): Disposable {
    return languages.onDidChangeDiagnostics(handler);
}
